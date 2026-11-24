import os
import platform
from pathlib import Path

import psutil

from .sampling import optional, mapping

CRITICAL_NAMES = {"launchd", "kernel_task", "systemd", "init", "wininit.exe", "csrss.exe",
                  "services.exe", "lsass.exe", "winlogon.exe", "smss.exe", "system", "explorer.exe"}
WINDOWS_PRIORITY = {"IDLE": 19, "BELOW_NORMAL": 5, "NORMAL": 0, "ABOVE_NORMAL": -5, "HIGH": -10, "REALTIME": -20}


def inspect(pid):
    proc = psutil.Process(pid)
    with proc.oneshot():
        return {"pid": pid, "name": optional(proc.name), "create_time": proc.create_time(),
                "threads": optional(lambda: [mapping(t) for t in proc.threads()]),
                "io": mapping(optional(lambda: proc.io_counters())),
                "context_switches": mapping(optional(proc.num_ctx_switches)),
                "executable": optional(proc.exe), "status": optional(proc.status)}


def control(pid, action, creation, priority=None, protected=()):
    if pid <= 1 or pid in protected:
        raise PermissionError("Protected process")
    current = psutil.Process(os.getpid())
    if pid == current.pid or pid in {p.pid for p in current.parents() + current.children(recursive=True)}:
        raise PermissionError("OS Pulse and its process hierarchy are protected")
    proc = psutil.Process(pid)
    if abs(proc.create_time() - creation) > 0.000001 or not proc.is_running():
        raise ValueError("Process identity changed. Refresh the process list.")
    if platform.system() == "Windows":
        authorized = proc.username().casefold() == current.username().casefold()
    else:
        uid = os.geteuid()
        authorized = uid != 0 and all(value == uid for value in proc.uids())
    if not authorized or proc.name().casefold() in CRITICAL_NAMES:
        raise PermissionError("Process is protected or outside the current user scope")
    executable = Path(proc.exe())
    if platform.system() == "Darwin" and any(executable.is_relative_to(root) for root in
                                             ("/System", "/usr/libexec", "/usr/sbin", "/sbin")):
        raise PermissionError("Platform system executable is protected")
    if action == "priority":
        if priority is None:
            raise ValueError("Priority is required")
        if platform.system() == "Windows":
            choices = {value: getattr(psutil, key + "_PRIORITY_CLASS") for key, value in WINDOWS_PRIORITY.items()}
            if priority not in choices:
                raise ValueError("Windows priority must be one of 19, 5, 0, -5, -10, -20")
            if not proc.is_running():
                raise ValueError("Process identity changed")
            proc.nice(choices[priority])
        else:
            if not proc.is_running():
                raise ValueError("Process identity changed")
            proc.nice(priority)
    elif action == "terminate" and platform.system() == "Windows":
        raise NotImplementedError("Graceful termination is not available for arbitrary Windows processes")
    else:
        getattr(proc, action)()
