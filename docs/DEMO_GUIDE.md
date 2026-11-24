# Five-minute college demonstration

Start both servers and open the dashboard before the demonstration. Keep the machine signed in as a regular user. Reserve the final minute for the synchronization lab and questions.

| Time | Action | What to say |
|---|---|---|
| 0:00–0:45 | Open System Overview. Point to live status, CPU and memory, then the disk and process charts. | “The backend reads psutil counters from this host. Every browser shares one sampler and receives a snapshot over WebSocket. The charts retain a bounded recent history.” |
| 0:45–1:25 | Open Process Manager. Search for a visible process, sort by RSS, and open its inspection. Open Process Tree and search for the same PID. | “PID identifies a process, PPID identifies its observed parent, and creation time guards against PID reuse. RSS describes resident pages. VMS describes virtual address space.” |
| 1:25–2:10 | Open CPU Analytics and Threads and Scheduling. Point out logical cores and the process lifecycle diagram. | “These charts measure time shares. The lifecycle diagram describes textbook transitions. Sleeping is an observed state that can indicate waiting for I/O, timers, or locks.” |
| 2:10–3:00 | Start a 20-second Lifecycle experiment. Suspend, resume, and terminate its child. Read PID, PPID and recorded events. | “This child belongs to the lab. Its state changes are real. The supervisor applies a deadline and cleans up the child.” |
| 3:00–3:45 | Run Race and Synchronization. Compare expected and actual counts for both cases. | “Increment is a read–modify–write. Threads or processes can overlap and lose writes. The lock makes the update mutually exclusive. A race result can occasionally match the expected total.” |
| 3:45–4:20 | Run Deadlock Detection. Show the wait-for graph and the consistent order events. | “The cycle is recorded from the lab’s lock protocol. Timeouts resolve the demonstration, then both threads acquire A before B.” |
| 4:20–5:00 | Open System Health and Alerts and Activity Logs. Show metric deductions, lab records, and CSV export. | “Health uses weighted 30-second averages and redistributes unavailable weights. Utilization signals where to inspect. Workload response time is needed to validate an actual bottleneck.” |

If a run is still active, use **Emergency stop** and wait for its state to settle. If process enumeration is restricted by a development sandbox, run both services from a normal local terminal.
