"""Host counters are sampled by one worker. Missing counters stay null."""
import platform
import socket
import subprocess
import time
from functools import lru_cache
from pathlib import Path

import psutil


def optional(read, default=None):
    try:
        return read()
    except (psutil.Error, OSError, NotImplementedError, AttributeError, subprocess.TimeoutExpired):
        return default


def mapping(value):
    return dict(value._asdict()) if value is not None else {}


def processor_model():
    if platform.system() == "Darwin":
        model = optional(lambda: subprocess.run(
            ["/usr/sbin/sysctl", "-n", "machdep.cpu.brand_string"], capture_output=True,
            text=True, timeout=1, check=False).stdout.strip())
        return model or None
    processor = platform.processor()
    return processor if processor and processor != platform.machine() else None


@lru_cache(maxsize=1)
def system_info():
    return {
        "hostname": socket.gethostname(), "os": platform.system(),
        "version": platform.release(), "architecture": platform.machine(),
        "processor": processor_model(),
        "physical": psutil.cpu_count(False), "logical": psutil.cpu_count(),
        "ram": psutil.virtual_memory().total, "boot": optional(psutil.boot_time),
    }


def rates(current, previous, elapsed):
    return {
        key: (value - previous[key]) / elapsed
        if elapsed > 0 and key in previous and value >= previous[key] else None
        for key, value in current.items()
    }


def cpu_interval(current, previous):
    # Linux guest times are already included in user and nice.
    if not previous:
        return None, {}
    delta = {key: max(0, value - previous.get(key, value)) for key, value in current.items()}
    total = sum(value for key, value in delta.items() if key not in ("guest", "guest_nice"))
    if total <= 0:
        return None, {}
    busy = total - delta.get("idle", 0) - delta.get("iowait", 0)
    for host, guest in (("user", "guest"), ("nice", "guest_nice")):
        if host in delta:
            delta[host] = max(0, delta[host] - delta.get(guest, 0))
    return round(100 * busy / total, 1), {key: round(100 * value / total, 1) for key, value in delta.items()}


def process_tree(rows):
    by_pid = {row["pid"]: row for row in rows}
    return [
        {**row, "parent": parent["pid"] if parent and parent["pid"] != row["pid"]
         and (not parent.get("create_time") or not row.get("create_time")
              or parent["create_time"] <= row["create_time"]) else None}
        for row in rows for parent in [by_pid.get(row["ppid"])]
    ]


class Sampler:
    def __init__(self):
        self.previous = {}
        self.last = None
        self.processes = []
        self.cpu_times = {}
        self.core_times = []
        self.process_at = float("-inf")

    def read_processes(self):
        rows = []
        attrs = ["pid", "ppid", "name", "status", "memory_info", "memory_percent",
                 "num_threads", "nice", "username", "create_time", "cpu_times"]
        for proc in psutil.process_iter(attrs, ad_value=None):
            try:
                row = proc.info.copy()
                memory = mapping(row.pop("memory_info"))
                times = mapping(row.pop("cpu_times"))
                row.update(cpu=proc.cpu_percent(None), rss=memory.get("rss"), vms=memory.get("vms"),
                           cpu_time=times["user"] + times["system"] if times else None)
                rows.append(row)
            except (psutil.NoSuchProcess, psutil.ZombieProcess):
                continue
            except psutil.AccessDenied:
                row.update(cpu=None, rss=memory.get("rss"), vms=memory.get("vms"), cpu_time=None)
                rows.append(row)
        return rows

    def __call__(self, interval=2):
        now = time.monotonic()
        stamp = time.time()
        if now - self.process_at >= max(4, interval + 1):
            self.processes = optional(self.read_processes)
            self.process_at = now
        cpu_times = mapping(psutil.cpu_times())
        core_times = [mapping(value) for value in psutil.cpu_times(percpu=True)]
        cpu, shares = cpu_interval(cpu_times, self.cpu_times)
        cores = [cpu_interval(value, self.core_times[index] if index < len(self.core_times) else {})[0]
                 for index, value in enumerate(core_times)]
        self.cpu_times, self.core_times = cpu_times, core_times
        memory = mapping(psutil.virtual_memory())
        swap = mapping(optional(psutil.swap_memory))
        disk = mapping(psutil.disk_usage(str(Path.home())))
        io = mapping(optional(psutil.disk_io_counters))
        stats = mapping(optional(psutil.cpu_stats))
        counters = {**io, **stats}
        delta = rates(counters, self.previous, now - self.last if self.last is not None else 0)
        self.previous, self.last = counters, now
        partitions = []
        for part in optional(psutil.disk_partitions, []):
            partitions.append({**mapping(part), **mapping(optional(lambda: psutil.disk_usage(part.mountpoint)))})
        rows = [{**row, "duration": max(0, stamp - row["create_time"]) if row["create_time"] else None}
                for row in (self.processes or [])]
        return {
            "time": stamp, "uptime": max(0, stamp - system_info()["boot"]) if system_info()["boot"] else None,
            "cpu": {"percent": cpu, "cores": cores, "times": shares,
                    "frequency": mapping(optional(psutil.cpu_freq)), "load": optional(psutil.getloadavg),
                    "stats": stats, "switch_rate": delta.get("ctx_switches")},
            "memory": memory, "swap": swap,
            "disk": {**disk, "partitions": partitions, "counters": io, "rates": delta},
            "processes": rows, "process_count": len(rows) if self.processes is not None else None,
            "thread_count": sum(row["num_threads"] or 0 for row in rows) if self.processes is not None else None,
        }
