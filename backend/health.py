"""Transparent health heuristic and sustained observations."""

WEIGHTS = {"CPU": .30, "Memory": .30, "Swap": .15, "Disk": .15, "Load": .10}
ADVICE = {
    "CPU": "Inspect the processes ranked by CPU usage.",
    "Memory": "Inspect process RSS and close workloads you no longer need.",
    "Swap": "Review resident memory and swap activity together.",
    "Disk": "Review large files on the monitored volume.",
    "Load": "Compare load with logical CPU count and check I/O activity.",
}


def normalize(value):
    return min(100, max(0, value))


def score(samples, logical):
    values = {
        "CPU": [s["cpu"] for s in samples], "Memory": [s["memory"] for s in samples],
        "Swap": [s["swap"] for s in samples], "Disk": [s["disk"] for s in samples],
        "Load": [s["load"] * 100 / logical if logical and s["load"] is not None else None for s in samples],
    }
    averages = {}
    for name, readings in values.items():
        known = [value for value in readings if value is not None]
        if known:
            averages[name] = normalize(sum(known) / len(known))
    total = sum(WEIGHTS[k] for k in averages)
    parts = [
        {"metric": k, "pressure": round(v, 1), "weight": WEIGHTS[k] / total,
         "deduction": round(v * WEIGHTS[k] / total, 2), "recommendation": ADVICE[k]}
        for k, v in averages.items()
    ]
    result = round(100 - sum(v * WEIGHTS[k] / total for k, v in averages.items())) if total else None
    label = (("Healthy" if result >= 80 else "Moderate" if result >= 60 else
              "Warning" if result >= 40 else "Critical") if result is not None else None)
    return {"score": result, "label": label, "contributions": parts}


def observations(samples, config, processes):
    if not samples:
        return []
    latest = samples[-1]
    result = []

    def add(key, level, message, action, pid=None):
        result.append(dict(key=key, level=level, message=message, action=action, pid=pid))

    for key, title in (("cpu", "CPU"), ("memory", "Memory")):
        cutoff = latest["time"] - config.sustain
        prior = [s for s in samples if s["time"] <= cutoff]
        threshold = getattr(config, key)
        if prior:
            window = [s for s in samples if s["time"] >= prior[-1]["time"]]
            contiguous = all(b["time"] - a["time"] <= max(4, config.interval * 2)
                             for a, b in zip(window, window[1:]))
            if contiguous and all(s[key] is not None and s[key] >= threshold for s in window):
                add(key, "warning", f"{title} utilization stayed at or above {threshold}% for at least {config.sustain}s.", ADVICE[title])
    for key, title, level in (("disk", "Disk", "critical"), ("swap", "Swap", "warning")):
        if latest[key] is not None and latest[key] >= getattr(config, key):
            add(key, level, f"{title} utilization reached {latest[key]:.1f}%.", ADVICE[title])
    if latest["read"] is not None and latest["write"] is not None:
        throughput = (latest["read"] + latest["write"]) / 1048576
        if throughput >= config.io:
            add("io", "warning", f"Combined disk throughput reached {throughput:.1f} MiB/s.", "Compare storage activity with workloads and response times.")
    trend = [s for s in samples if s["time"] >= latest["time"] - 120 and s["memory"] is not None]
    if trend and latest["time"] - trend[0]["time"] >= 60 and trend[-1]["memory"] - trend[0]["memory"] >= 10:
        add("memory-trend", "info", "Memory utilization rose by at least 10 percentage points within two minutes.", ADVICE["Memory"])
    for field, label in (("cpu", "CPU"), ("rss", "resident memory")):
        top = max(processes, key=lambda p: p[field] or 0, default=None)
        if top and top[field]:
            add(f"top-{field}", "info", f"{top['name']} is the largest observed {label} consumer.", "Inspect the process and its workload.", top["pid"])
    return result
