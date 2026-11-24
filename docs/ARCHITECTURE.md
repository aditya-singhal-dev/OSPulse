# Architecture

The frontend expects a local peer at `127.0.0.1:8000`. Vite proxies REST and WebSocket traffic on behalf of the browser. Clients share one collector. The collector runs serial sampling in a worker thread, then publishes the latest snapshot to a queue with one slot per subscriber. A slow subscriber skips stale samples.

The sampler defaults to two seconds. Process enumeration runs no faster than every four seconds and can run slower at longer refresh intervals. psutil records per-process CPU counters across enumerations. Duration uses wall-clock creation time. Throughput uses monotonic elapsed time and differences between adjacent cumulative counters. Decreases and the initial sample have no rate. System metadata is cached for the life of the server.

Recent aggregate points occupy a 360-element deque. The browser displays up to 300 points and fetches persisted history on entry. SQLite uses WAL mode, batches metrics up to five samples, writes exceptional resource alerts promptly, and flushes on normal shutdown. Alerts deduplicate by key within a five-minute window. Metrics, alerts and activity have a seven-day deletion window, enforced when persisting samples. The database file can retain pages for reuse after deletion.

The lab reserves its single slot before starting a spawn-based experiment. A supervisor captures child measurements and event records, applies cancellation and the deadline, and reaps the root. Multiprocessing workers poll the same cancellation event. Buffered and deadlock threads have bounded waits. The lab resumes a suspended experiment root during cancellation so it can exit. If the deadline or stop persists after the grace period, the supervisor kills the remaining lab processes it can observe. OS Pulse never requests elevated privileges.

Host and browser origin checks limit exposure to loopback. A session token is generated in memory at server startup and requested by the browser only for mutations. An ordinary browser page on another origin cannot read it through the permitted CORS policy. Process actions also validate PID creation time, protect the application's own family and selected system processes, and check effective ownership. The native OS remains the final authority on permissions.

## Development sequence

1. Initialize Python modules, Vite config and dependency definitions.
2. Sample real host resources and expose REST reads.
3. Publish shared snapshots and implement browser reconnect.
4. Build the overview, app navigation, and chart components.
5. Add protected controls, inspection, and hierarchy.
6. Add analytical pages and OS explanations.
7. Normalize health inputs and produce threshold observations.
8. Add bounded workload supervision and event rendering.
9. Integrate durable alerts, history, audit, and CSV.
10. Run unit, integration, browser, and native lab checks.
