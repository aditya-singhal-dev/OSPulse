import time

import psutil
import pytest
from fastapi.testclient import TestClient

from backend.experiments import Lab, memory_limit
from backend.health import normalize, observations, score
from backend.main import create_app
from backend.models import ExperimentRequest, Settings
from backend.processes import control
from backend.sampling import cpu_interval, process_tree, rates
from backend.store import Store


def reading(stamp, **updates):
    return {"time": stamp, "cpu": 40, "memory": 50, "swap": 0, "disk": 60,
            "load": 2, "read": 0, "write": 0, **updates}


@pytest.mark.parametrize(("value", "expected"), [(-2, 0), (45, 45), (102, 100)])
def test_normalization(value, expected):
    assert normalize(value) == expected


def test_health_redistributes_missing_metrics_and_averages():
    result = score([reading(0, swap=None, load=None), reading(2, cpu=60, swap=None, load=None)], 8)
    assert result["score"] == 48
    assert sum(part["weight"] for part in result["contributions"]) == pytest.approx(1)
    assert {part["metric"] for part in result["contributions"]} == {"CPU", "Memory", "Disk"}
    assert score([], None)["score"] is None


def test_bottlenecks_require_contiguous_sustained_samples():
    samples = [reading(stamp, cpu=90) for stamp in range(0, 32, 2)]
    assert [x["key"] for x in observations(samples, Settings(), [])] == ["cpu"]
    assert observations([samples[0], samples[-1]], Settings(), []) == []
    assert observations(samples[1:], Settings(), []) == []


def test_counter_rate_handles_first_sample_and_reset():
    assert rates({"bytes": 300}, {"bytes": 100}, 2) == {"bytes": 100}
    assert rates({"bytes": 9}, {"bytes": 100}, 2) == {"bytes": None}
    assert rates({"bytes": 9}, {}, 0) == {"bytes": None}


def test_tree_missing_recycled_and_self_parents():
    rows = [
        {"pid": 1, "ppid": 0, "create_time": 1}, {"pid": 2, "ppid": 1, "create_time": 2},
        {"pid": 3, "ppid": 4, "create_time": 3}, {"pid": 4, "ppid": 4, "create_time": 4},
    ]
    assert [row["parent"] for row in process_tree(rows)] == [None, 1, None, None]


def test_process_protection_and_pid_reuse(monkeypatch):
    with pytest.raises(PermissionError):
        control(1, "kill", 1)

    class Process:
        def __init__(self, pid):
            self.pid = pid

        def parents(self):
            return []

        def children(self, recursive=False):
            return []

        def create_time(self):
            return 30

    monkeypatch.setattr(psutil, "Process", Process)
    with pytest.raises(ValueError, match="identity"):
        control(99999, "kill", 20)


def test_api_websocket_and_audit(tmp_path, monkeypatch):
    def denied(*args):
        raise psutil.AccessDenied(pid=42)

    monkeypatch.setattr("backend.main.control", denied)
    with TestClient(create_app(tmp_path / "pulse.sqlite"), base_url="http://localhost") as client:
        assert client.get("/api/system/info").json()["ram"] > 0
        assert client.get("/api/session", headers={"Origin": "https://example.org"}).status_code == 403
        assert client.get("http://external.invalid/api/session").status_code == 400
        with client.websocket_connect("/ws/metrics", headers={"Origin": "http://localhost:5173", "Host": "localhost"}) as ws:
            sample = ws.receive_json()
            while "time" not in sample or sample["cpu"]["percent"] is None:
                sample = ws.receive_json()
            assert 0 <= sample["cpu"]["percent"] <= 100
            assert "processes" not in sample and "point" in sample
        token = client.get("/api/session").json()["token"]
        body = {"create_time": 100, "confirmed": True}
        url = "/api/processes/42/kill"
        assert client.post(url, json=body).status_code == 403
        assert client.post(url, json={**body, "confirmed": False}, headers={"X-OS-Pulse-Token": token}).status_code == 422
        assert client.post(url, json=body, headers={"X-OS-Pulse-Token": token}).status_code == 403
        assert len(client.get("/api/logs").json()) == 3
        assert "time,cpu,memory" in client.get("/api/export/metrics").text


def test_experiment_constraints():
    assert memory_limit(1024 * 1048576) == 128
    assert memory_limit(4096 * 1048576) == 256
    with pytest.raises(ValueError):
        ExperimentRequest(kind="cpu", duration=31)
    with pytest.raises(ValueError):
        ExperimentRequest(kind="memory", memory=257)


def test_real_experiment_cancellation_and_cleanup():
    lab = Lab(lambda *args: None)
    result = lab.start(ExperimentRequest(kind="cpu", duration=8))
    with pytest.raises(ValueError, match="already"):
        lab.start(ExperimentRequest(kind="memory"))
    time.sleep(.4)
    lab.stop(wait=True)
    assert lab.status()["state"] == "stopped"
    assert lab.process is None
    assert not psutil.pid_exists(result["pid"])


def test_alert_cooldown_and_read_state(tmp_path):
    store = Store(tmp_path / "pulse.sqlite")
    store.initialize()
    now = time.time()
    alert = {"key": "cpu", "level": "warning", "message": "High CPU",
             "action": "Inspect CPU", "pid": None}
    for timestamp in (now, now + 20, now + 301):
        store.persist([], [alert], timestamp)
    rows = store.rows("alerts", 10)
    assert len(rows) == 2
    assert store.read_alert(rows[0]["id"])
    assert store.rows("alerts", 10)[0]["read"] == 1


def test_cpu_shares_handle_first_sample_and_linux_guest_overlap():
    first = {"user": 5, "idle": 10, "iowait": 2, "guest": 2}
    latest = {"user": 9, "idle": 15, "iowait": 3, "guest": 4}
    assert cpu_interval(first, {}) == (None, {})
    percent, shares = cpu_interval(latest, first)
    assert percent == 40
    assert shares["idle"] == 50
