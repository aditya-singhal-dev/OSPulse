import asyncio
import hmac
import os
import secrets
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

import psutil
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from starlette.concurrency import run_in_threadpool

from .experiments import Lab
from .health import observations, score
from .models import ExperimentRequest, LifecycleAction, ProcessAction, Settings
from .processes import control, inspect
from .sampling import Sampler, process_tree, system_info
from .store import Store

ORIGINS = {f"http://{host}:{port}" for host in ("localhost", "127.0.0.1") for port in (5173, 8000, 4173)}
HOSTS = ["localhost", "127.0.0.1"]


def create_app(db_path=None):
    store = Store(db_path or os.environ.get("OSPULSE_DB", Path.home() / ".os-pulse" / "pulse.sqlite"))
    token = secrets.token_urlsafe(32)
    sampler = Sampler()
    lab = Lab(store.log)
    history = deque(maxlen=360)
    live = {}
    pending = []
    subscribers = set()
    settings = Settings()

    async def monitor(stop):
        while not stop.is_set():
            try:
                snapshot = await run_in_threadpool(sampler, settings.interval)
                cpu, memory, swap, disk = (snapshot[k] for k in ("cpu", "memory", "swap", "disk"))
                point = dict(time=snapshot["time"], cpu=cpu["percent"], memory=memory["percent"],
                             swap=swap.get("percent") if swap.get("total") else None, disk=disk["percent"],
                             load=cpu["load"][0] if cpu["load"] else None,
                             available=memory["available"], cores=cpu["cores"],
                             read=disk["rates"].get("read_bytes"), write=disk["rates"].get("write_bytes"),
                             processes=snapshot["process_count"])
                history.append(point)
                snapshot["health"] = score([s for s in history if s["time"] >= point["time"] - 30],
                                           system_info()["logical"])
                point["health"] = snapshot["health"]["score"]
                snapshot["observations"] = observations(list(history), settings, snapshot["processes"])
                snapshot["top_cpu"] = sorted(snapshot["processes"], key=lambda p: p["cpu"] or 0, reverse=True)[:5]
                snapshot["top_memory"] = sorted(snapshot["processes"], key=lambda p: p["rss"] or 0, reverse=True)[:5]
                snapshot["point"] = point
                live.update(snapshot)
                live.pop("error", None)
                await run_in_threadpool(lab.record, point)
                pending.append(point)
                for subscriber in subscribers:
                    if subscriber.full():
                        subscriber.get_nowait()
                    subscriber.put_nowait(public())
                if len(pending) >= 5 or any(x["level"] != "info" for x in snapshot["observations"]):
                    await run_in_threadpool(store.persist, pending[:], snapshot["observations"], point["time"])
                    pending.clear()
            except Exception as error:
                live["error"] = f"Sampling or persistence error: {error}"
                for subscriber in subscribers:
                    if subscriber.full():
                        subscriber.get_nowait()
                    subscriber.put_nowait(public())
                del pending[:-360]
            try:
                await asyncio.wait_for(stop.wait(), timeout=settings.interval)
            except TimeoutError:
                pass

    @asynccontextmanager
    async def lifespan(_app):
        nonlocal settings
        await run_in_threadpool(store.initialize)
        saved = await run_in_threadpool(store.settings)
        if saved:
            settings = Settings.model_validate_json(saved)
        stop = asyncio.Event()
        task = asyncio.create_task(monitor(stop))
        try:
            yield
        finally:
            stop.set()
            await task
            await run_in_threadpool(lab.stop, True)
            if pending:
                await run_in_threadpool(store.persist, pending, live.get("observations", []), pending[-1]["time"])

    app = FastAPI(title="OS Pulse", version="1.0.0", lifespan=lifespan)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=HOSTS)
    app.add_middleware(CORSMiddleware, allow_origins=sorted(ORIGINS),
                       allow_methods=["GET", "POST", "PATCH", "PUT"],
                       allow_headers=["content-type", "x-os-pulse-token"])

    @app.middleware("http")
    async def origin_guard(request, call_next):
        if request.headers.get("origin") not in ORIGINS | {None} or request.headers.get("sec-fetch-site") == "cross-site":
            if request.method in ("POST", "PATCH") and request.url.path.startswith("/api/processes/"):
                await run_in_threadpool(store.log, request.url.path, "Rejected: invalid origin")
            return Response("Origin not permitted", status_code=403)
        return await call_next(request)

    def local_token(request: Request):
        if not hmac.compare_digest(request.headers.get("x-os-pulse-token", ""), token):
            if request.url.path.startswith("/api/processes/"):
                store.log(request.url.path, "Rejected: invalid session token")
            raise HTTPException(403, "Local session token required")

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, error):
        if request.method in ("POST", "PATCH") and request.url.path.startswith("/api/processes/"):
            await run_in_threadpool(store.log, request.url.path, "Rejected: invalid request")
        return await request_validation_exception_handler(request, error)

    def public():
        return {k: v for k, v in live.items() if k != "processes"}

    @app.get("/api/session")
    def session(response: Response):
        response.headers["Cache-Control"] = "no-store"
        return {"token": token}

    @app.get("/api/system/info")
    def info():
        return system_info()

    @app.get("/api/system/overview")
    def overview():
        return public()

    @app.get("/api/cpu")
    @app.get("/api/memory")
    @app.get("/api/disk")
    @app.get("/api/health")
    def section(request: Request):
        key = request.url.path.rsplit("/", 1)[1]
        return live.get(key, {})

    @app.get("/api/processes")
    def processes():
        return live.get("processes", [])

    @app.get("/api/processes/tree")
    def tree():
        return process_tree(processes())

    @app.get("/api/processes/{pid}")
    def process(pid: int):
        if pid < 0:
            raise HTTPException(422, "PID must be nonnegative")
        try:
            return inspect(pid)
        except psutil.NoSuchProcess as error:
            raise HTTPException(404, "Process has exited") from error
        except psutil.AccessDenied as error:
            raise HTTPException(403, "Process details are restricted") from error

    def perform(pid, action, body):
        event = f"Process {action} · PID {pid}"
        try:
            control(pid, action, body.create_time, body.priority, (lab.status().get("pid"),))
        except (psutil.Error, PermissionError, ValueError, NotImplementedError, OSError) as error:
            status = (409 if isinstance(error, psutil.ZombieProcess) else
                      404 if isinstance(error, psutil.NoSuchProcess) else
                      403 if isinstance(error, (psutil.AccessDenied, PermissionError)) else
                      501 if isinstance(error, NotImplementedError) else 409)
            store.log(event, f"Rejected: {error}")
            raise HTTPException(status, str(error)) from error
        store.log(event, "Requested operation dispatched")
        return {"result": "dispatched"}

    @app.patch("/api/processes/{pid}/priority", dependencies=[Depends(local_token)])
    def priority(pid: int, body: ProcessAction):
        return perform(pid, "priority", body)

    @app.post("/api/processes/{pid}/{action}", dependencies=[Depends(local_token)])
    def process_action(pid: int, action: Literal["suspend", "resume", "terminate", "kill"], body: ProcessAction):
        return perform(pid, action, body)

    @app.get("/api/settings")
    def get_settings():
        return settings

    @app.put("/api/settings", dependencies=[Depends(local_token)])
    async def set_settings(body: Settings):
        nonlocal settings
        await run_in_threadpool(store.settings, body)
        settings = body
        return settings

    @app.get("/api/history")
    async def past(limit: int = Query(300, ge=1, le=3600)):
        recorded = await run_in_threadpool(store.rows, "metrics", limit)
        combined = {s["time"]: s for s in [*recorded, *history]}
        return sorted(combined.values(), key=lambda s: s["time"])[-limit:]

    @app.get("/api/alerts")
    def alerts(limit: int = Query(100, ge=1, le=1000)):
        return store.rows("alerts", limit)

    @app.patch("/api/alerts/{alert_id}/read", dependencies=[Depends(local_token)])
    def read_alert(alert_id: int):
        if not store.read_alert(alert_id):
            raise HTTPException(404, "Alert not found")
        return {"read": True}

    @app.get("/api/logs")
    def logs(limit: int = Query(100, ge=1, le=1000)):
        return store.rows("logs", limit)

    @app.get("/api/export/{table}")
    def export(table: Literal["metrics", "alerts", "logs"]):
        return Response(store.export(table), media_type="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="os-pulse-{table}.csv"'})

    @app.post("/api/experiments/start", dependencies=[Depends(local_token)])
    def start(body: ExperimentRequest):
        try:
            result = lab.start(body)
        except (ValueError, OSError) as error:
            store.log("Experiment start", f"Rejected: {error}")
            raise HTTPException(409, str(error)) from error
        store.log("Experiment " + body.kind, "Started")
        return result

    @app.post("/api/experiments/stop", dependencies=[Depends(local_token)])
    def stop_experiment():
        lab.stop()
        store.log("Experiment stop", "Stop requested")
        return lab.status()

    @app.post("/api/experiments/lifecycle", dependencies=[Depends(local_token)])
    def lifecycle(body: LifecycleAction):
        try:
            lab.lifecycle(body.action)
        except (ValueError, psutil.Error, OSError, NotImplementedError) as error:
            store.log("Experiment lifecycle " + body.action, f"Rejected: {error}")
            raise HTTPException(409, str(error)) from error
        store.log("Experiment lifecycle " + body.action, "Dispatched")
        return lab.status()

    @app.get("/api/experiments/status")
    def experiment_status():
        return lab.status()

    @app.websocket("/ws/metrics")
    async def stream(socket: WebSocket):
        if socket.headers.get("origin") not in ORIGINS:
            await socket.close(code=1008)
            return
        await socket.accept()
        queue = asyncio.Queue(maxsize=1)
        subscribers.add(queue)
        receiver = asyncio.create_task(socket.receive())
        sender = asyncio.create_task(queue.get())
        try:
            await socket.send_json(public())
            while True:
                done, _ = await asyncio.wait((receiver, sender), return_when=asyncio.FIRST_COMPLETED)
                if receiver in done:
                    if receiver.result()["type"] == "websocket.disconnect":
                        return
                    receiver = asyncio.create_task(socket.receive())
                if sender in done:
                    await socket.send_json(sender.result())
                    sender = asyncio.create_task(queue.get())
        except (WebSocketDisconnect, OSError, asyncio.CancelledError):
            pass
        finally:
            subscribers.discard(queue)
            receiver.cancel()
            sender.cancel()
            try:
                await asyncio.gather(receiver, sender, return_exceptions=True)
            except asyncio.CancelledError:
                pass

    return app


app = create_app()
