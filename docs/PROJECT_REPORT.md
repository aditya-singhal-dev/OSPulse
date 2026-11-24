# OS Pulse project report

## Abstract

OS Pulse monitors real host resources, exposes an interactive process inventory, and provides controlled experiments for learning operating systems. A Python service samples the host and sends snapshots to a local React dashboard. The software records historical metrics and audit events and provides an explainable resource health heuristic.

## Introduction and problem statement

Operating system courses teach CPU scheduling, memory virtualization, process control, and synchronization. It can be difficult to relate those concepts to the workload of a running computer. Native monitors expose useful metrics, while controlled experiments and explanations help connect those measurements to underlying behavior.

## Objectives

Measure actual CPU, memory, swap, disk I/O, observable processes, and threads. Make readings explorable through live charts and a process hierarchy. Enable guarded process operations, bounded lab workloads, threshold analysis, and reviewable history.

## Methodology and architecture

The backend captures psutil counter snapshots on a shared schedule. It calculates interval rates and keeps a bounded working set. FastAPI serves REST endpoints and fans updates out over a local WebSocket. The frontend charts time series and exposes controls. SQLite preserves recent aggregate samples, threshold alerts and the activity log.

Host measurements and educational diagrams are presented with separate labels. The project avoids inferring the exact ready queue, page fragmentation, or thrashing from available counters.

## Implementation and algorithms

1. **Counter differences.** Compute throughput as the increase in cumulative bytes divided by monotonic elapsed time. The first sample and intervals containing a reset carry an unavailable rate. CPU busy time is the fraction of elapsed CPU ticks outside idle and I/O wait.
2. **Process hierarchy.** Index processes by PID and resolve each PPID against the same sample. Missing parents and self-links produce root nodes. A parent created after the child is excluded to account for stale or reused IDs.
3. **Health and thresholds.** For each available input, use the last 30 seconds of samples and clamp its normalized average to 0–100. Divide each weight by the sum of available weights. Deduct the weighted pressures from 100. Sustained threshold checks require continuous observations spanning the configured window. Other rules inspect storage capacity, swap occupancy, I/O throughput, memory trends, and relative process resource use.
4. **Process actions.** Validate the local session token, target identity, owner, and protected scope. Dispatch a supported operation and record its outcome. The process's next observation confirms whether its state changed.
5. **Bounded experiments.** Start one experiment at a time using a spawned child. Cap duration at 30 seconds, memory at 256 MiB and one eighth of current available memory, and CPU parallelism at two workload workers. Communicate cancellation and use timed waits, then reap children and close temporary resources.
6. **Alert deduplication.** Give each rule a stable key. Within a transaction, insert an alert only if that key has no observation recorded within five minutes.

## Testing and results

Automated tests cover clipping and health weighting, contiguous threshold detection, counter rates, missing baseline CPU, PID reuse, process authorization, hierarchy, WebSocket delivery, API validation, SQLite cooldown and read state, and real experiment cancellation. Frontend lint and production compilation are separate checks.

Native macOS verification opened all 12 pages in Chrome, checked live WebSocket data and the process inspection and tree, ran all eight experiments, and checked that each experiment's root PID exited. Priority, suspend, resume, graceful termination, and force kill were also verified against temporary same-user sleeper processes created by the verifier.

### Resource measurement

One 12-second process sample on an Apple Silicon Mac with 8 GiB RAM used the default sampling interval and one connected headless Chrome tab. The preview and API were running on loopback with no lab workload during this measurement. CPU percentages are relative to one logical core. Browser resource use is excluded from this measurement.

| Process | Mean CPU over 12 seconds | RSS at end |
|---|---:|---:|
| Uvicorn backend | 2.0% | 36.7 MiB |
| Vite preview | 0.1% | 59.7 MiB |

Measurements depend on process count, active workloads, operating system, browser, and runtime. To reproduce, start the backend and preview, open one dashboard tab, and sample each PID using `psutil.Process(pid).cpu_percent(interval=12)` followed by `memory_info().rss`. Use concurrent sampler threads if measuring both processes in the same interval.

## Limitations

Counter visibility and process controls depend on platform and user privileges. macOS frequently omits per-process I/O, CPU frequency, and I/O wait. Windows uses priority classes and does not provide a universal graceful termination operation for arbitrary processes. Native Linux and Windows end-to-end runs were outside this verification. A short lab can complete before the next aggregate sample. Process and disk counter resets create gaps, and relative resource rankings cannot establish a bottleneck on their own.

## Future scope

Add continuous cross-platform CI, historical report filters and downsampling, measured device latency where supported, and workload-specific baselines for resource alerts.

## Conclusion

OS Pulse ties actual host observations to controlled demonstrations of resource use, process lifecycle, concurrency, and synchronization. The experiment bounds and platform-aware fields let students explain which behavior was observed and which relationships come from the conceptual operating systems model.
