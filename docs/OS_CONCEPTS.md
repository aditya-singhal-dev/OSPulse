# Operating systems concepts

| Concept | Where to see it | Interpretation |
|---|---|---|
| CPU scheduling and preemption | CPU Analytics, Threads and Scheduling | A logical CPU time share describes recent execution. Kernel policy and ready queues are outside the exposed counters. |
| Context switching | CPU Analytics | A cumulative system counter records switches where supported. Its derivative is a rate. |
| Processes, threads and resources | Process Manager, Process Tree | A process owns an address space and resource references. Threads share those resources and carry individual execution state. |
| Process lifecycle | Threads and Scheduling, Lab | New, ready, running, waiting, and terminated describe a conceptual model. OS-specific statuses such as sleeping or stopped are separate observations. |
| Process control block | Threads and Scheduling | The PCB is a conceptual kernel record. User space receives selected fields through OS APIs. |
| Demand paging | Memory Lab | Touching each page encourages physical backing. RSS measures resident mappings, while VMS includes virtual mappings that can remain without resident pages. |
| Paging and swapping | Memory Analytics | A page fault requests kernel handling. Swapped bytes can remain occupied even after current pressure drops. |
| Fragmentation and thrashing | Memory Analytics | Internal fragmentation wastes space within allocation units. External fragmentation breaks up free ranges. Thrashing is sustained page replacement and reload overhead. These are conceptual explanations. |
| Storage and I/O | Disk and I/O | The operating system coordinates file systems, buffers, and device scheduling. Counter differences estimate average throughput during each interval. |
| GIL and parallelism | Threads and Multiprocessing Lab | Standard GIL-enabled CPython generally executes Python bytecode on one thread per interpreter at a time. Blocking socket reads can overlap. Independent processes can run across cores. |
| Race condition and mutex | Race Lab | Incrementing has separate read and write steps. Overlap can lose updates. A lock serializes each increment. |
| Producer–consumer | Buffer Lab | A bounded queue coordinates producers and consumers, blocks on full or empty conditions, and limits pending work. |
| Deadlock and prevention | Deadlock Lab | Two threads holding different locks can wait cyclically. Timed acquisition releases both participants. Acquiring locks in a consistent order avoids circular wait. |
