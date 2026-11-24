"""Small, spawn-based workloads. The supervisor owns every experiment root."""
import hashlib
import multiprocessing as mp
import os
import queue
import socket
import threading
import time

import psutil

CTX = mp.get_context("spawn")


def memory_limit(available):
    return min(256, available // (8 * 1048576))


def cpu_job(stop, deadline, iterations):
    for i in range(iterations):
        if i % 128 == 0 and (stop.is_set() or time.monotonic() >= deadline):
            break
        hashlib.sha256(i.to_bytes(8, "little")).digest()


def io_wait(stop):
    # A local socket supplies real blocking I/O with controlled producer latency.
    receiver, sender = socket.socketpair()
    with receiver, sender:
        def deliver():
            if not stop.wait(.16):
                sender.sendall(b"x")
            sender.shutdown(socket.SHUT_WR)

        producer = threading.Thread(target=deliver)
        producer.start()
        try:
            receiver.settimeout(1)
            receiver.recv(1)
        finally:
            producer.join()


def counter_job(counter, lock, stop, deadline):
    for index in range(18000):
        if index % 128 == 0 and (stop.is_set() or time.monotonic() >= deadline):
            return
        if lock is None:
            value = counter.value
            if index % 32 == 0:
                time.sleep(0)
            counter.value = value + 1
        else:
            with lock:
                counter.value += 1


def parallel(target, arguments):
    children = []
    try:
        for args in arguments:
            child = CTX.Process(target=target, args=args)
            child.start()
            children.append(child)
        for child in children:
            child.join()
            if child.exitcode:
                raise RuntimeError(f"Worker exited with code {child.exitcode}")
    finally:
        for child in children:
            if child.is_alive():
                child.terminate()
            child.join()
            child.close()


def run(kind, duration, memory, stop, events):
    deadline = time.monotonic() + duration

    def emit(event, **details):
        events.put(dict(event=event, time=time.time(), **details))

    try:
        emit("Child created", pid=os.getpid(), ppid=os.getppid())
        if kind == "cpu":
            cpu_job(stop, deadline, 10**10)
        elif kind == "memory":
            cap = memory_limit(psutil.virtual_memory().available)
            if memory > cap:
                raise RuntimeError("Available memory dropped below the allocation safety limit")
            block = bytearray(memory * 1048576)
            for offset in range(0, len(block), 4096):
                block[offset] = 1
            emit("Memory allocated and touched", mib=memory)
            stop.wait(max(0, deadline - time.monotonic()))
        elif kind == "lifecycle":
            stop.wait(max(0, deadline - time.monotonic()))
        elif kind == "threads":
            tasks = 8
            start = time.monotonic()
            for _ in range(tasks):
                io_wait(stop)
            sequential = time.monotonic() - start
            start = time.monotonic()
            workers = [threading.Thread(target=io_wait, args=(stop,)) for _ in range(tasks)]
            for worker in workers:
                worker.start()
            for worker in workers:
                worker.join()
            threaded = time.monotonic() - start
            if not stop.is_set():
                emit("I/O wait comparison", sequential=sequential, threaded=threaded, speedup=sequential / threaded)
        elif kind == "multiprocessing":
            iterations = 600000
            start = time.monotonic()
            cpu_job(stop, deadline, iterations * 2)
            sequential = time.monotonic() - start
            start = time.monotonic()
            parallel(cpu_job, [(stop, deadline, iterations)] * 2)
            elapsed = time.monotonic() - start
            if not stop.is_set() and time.monotonic() < deadline:
                emit("CPU comparison", sequential=sequential, parallel=elapsed, speedup=sequential / elapsed)
        elif kind == "race":
            for synchronized in (False, True):
                counter = CTX.RawValue("i", 0)
                lock = CTX.Lock() if synchronized else None
                parallel(counter_job, [(counter, lock, stop, deadline)] * 2)
                if not stop.is_set() and time.monotonic() < deadline:
                    emit("Shared counter", synchronized=synchronized, expected=36000, actual=counter.value)
        elif kind == "buffer":
            buffer = queue.Queue(maxsize=3)

            def produce():
                for item in range(12):
                    while not stop.is_set() and time.monotonic() < deadline:
                        try:
                            buffer.put(item, timeout=.09)
                            emit("Produced", item=item, occupancy=buffer.qsize())
                            break
                        except queue.Full:
                            emit("Producer waiting", occupancy=buffer.qsize())
                    stop.wait(.02)

            producer = threading.Thread(target=produce)
            producer.start()
            try:
                while (producer.is_alive() or not buffer.empty()) and not stop.is_set() and time.monotonic() < deadline:
                    try:
                        item = buffer.get(timeout=.09)
                        emit("Consumed", item=item, occupancy=buffer.qsize())
                        buffer.task_done()
                        stop.wait(.13)
                    except queue.Empty:
                        emit("Consumer waiting", occupancy=0)
            finally:
                producer.join()
        elif kind == "deadlock":
            locks = [threading.Lock(), threading.Lock()]
            barrier = threading.Barrier(2, timeout=.5)
            waiting = threading.Barrier(
                2, timeout=.5,
                action=lambda: emit("Circular wait detected", edges=["Thread 1 → Thread 2", "Thread 2 → Thread 1"],
                                    ownership={"Lock A": "Thread 1", "Lock B": "Thread 2"}))

            def contend(index):
                with locks[index]:
                    barrier.wait()
                    waiting.wait()
                    obtained = locks[1 - index].acquire(timeout=.25)
                    if obtained:
                        locks[1 - index].release()

            def ordered(index):
                with locks[0], locks[1]:
                    emit("Acquired locks A then B", thread=index)

            workers = [threading.Thread(target=contend, args=(i,)) for i in range(2)]
            for worker in workers:
                worker.start()
            for worker in workers:
                worker.join()
            ordered_workers = [threading.Thread(target=ordered, args=(index,)) for index in range(2)]
            for worker in ordered_workers:
                worker.start()
            for worker in ordered_workers:
                worker.join()
        emit("Child finished")
    except Exception as error:
        emit("Experiment error", message=str(error))
        raise


class Lab:
    def __init__(self, log):
        self.log = log
        self.lock = threading.Lock()
        self.process = None
        self.result = {"state": "idle"}
        self.latest = None

    def record(self, sample):
        if sample:
            metrics = {k: sample[k] for k in ("time", "cpu", "memory", "available", "cores", "swap", "read", "write")}
            with self.lock:
                self.latest = metrics
                if self.result["state"] == "running":
                    self.result["during"] = metrics
                elif self.result.get("finished") and not self.result.get("after") and metrics["time"] >= self.result["finished"]:
                    self.result["after"] = metrics

    def start(self, request):
        with self.lock:
            if self.process is not None:
                raise ValueError("An experiment is already running")
            if request.kind == "memory" and request.memory > memory_limit(psutil.virtual_memory().available):
                raise ValueError("Requested allocation exceeds one eighth of available memory or 256 MiB")
            self.stop_requested = False
            self.signal = CTX.Event()
            self.events = CTX.Queue()
            self.process = CTX.Process(target=run, args=(
                request.kind, request.duration, request.memory, self.signal, self.events))
            try:
                self.process.start()
            except Exception:
                self.events.close()
                self.process = None
                raise
            self.result = dict(state="running", kind=request.kind, pid=self.process.pid,
                               ppid=os.getpid(), started=time.time(), before=self.latest,
                               during=None, after=None, events=[], duration=request.duration)
            self.worker = threading.Thread(target=self.supervise)
            self.worker.start()
            return self.result.copy()

    def drain(self):
        while True:
            try:
                event = self.events.get_nowait()
            except queue.Empty:
                return
            with self.lock:
                self.result["events"].append(event)

    def supervise(self):
        process = self.process
        deadline = time.monotonic() + self.result["duration"]
        observed = None
        try:
            observed = psutil.Process(process.pid)
            observed.cpu_percent()
        except (psutil.Error, OSError):
            pass
        while process.is_alive():
            self.drain()
            try:
                if observed is None:
                    raise ProcessLookupError
                with observed.oneshot():
                    status = observed.status()
                    cpu = observed.cpu_percent()
                    cpu_times = observed.cpu_times()
                    memory = observed.memory_info()
                with self.lock:
                    self.result["child"] = dict(status=status, cpu=cpu, rss=memory.rss, vms=memory.vms,
                                                cpu_time=cpu_times.user + cpu_times.system,
                                                elapsed=time.time() - self.result["started"])
            except (psutil.Error, OSError):
                pass
            timed_out = time.monotonic() >= deadline
            if self.signal.is_set() or timed_out:
                self.signal.set()
                try:
                    if observed is not None:
                        observed.resume()
                except (psutil.Error, OSError):
                    pass
                process.join(.35)
                if process.is_alive():
                    try:
                        children = observed.children(recursive=True) if observed is not None else []
                    except psutil.Error:
                        children = []
                    for child in reversed(children):
                        try:
                            child.kill()
                        except psutil.Error:
                            pass
                    process.kill()
                    psutil.wait_procs(children, timeout=1)
                break
            process.join(.2)
        process.join()
        code = process.exitcode
        self.drain()
        self.events.close()
        with self.lock:
            state = "stopped" if self.stop_requested else "completed" if code == 0 or time.monotonic() >= deadline and code < 0 else "failed"
            self.result.update(state=state, finished=time.time(), exit_code=code)
            process.close()
            self.process = None
            self.log("Experiment " + self.result["kind"], state)

    def status(self):
        with self.lock:
            return {**self.result, "events": list(self.result.get("events", []))}

    def stop(self, wait=False):
        with self.lock:
            if self.process is None:
                return
            self.stop_requested = True
            self.signal.set()
            worker = self.worker
        if wait:
            worker.join()

    def lifecycle(self, action):
        with self.lock:
            if self.process is None or self.result["kind"] != "lifecycle" or not self.process.is_alive():
                raise ValueError("Start a lifecycle experiment first")
            proc = psutil.Process(self.process.pid)
            if action == "terminate":
                self.signal.set()
            else:
                getattr(proc, action)()
            self.result["events"].append(dict(event=f"Lifecycle {action}", time=time.time()))
