# Viva questions and answers

1. **What does OS Pulse measure?** It reads live CPU, memory, disk, process, and thread counters exposed by the host OS.
2. **Why is psutil used?** It wraps platform-specific system interfaces in a consistent Python API.
3. **Why use a single sampler?** It bounds polling overhead and gives every connected client the same measurement interval.
4. **Why WebSockets?** A persistent connection pushes new measurements to the browser as they arrive.
5. **What does a PID represent?** It is an OS process identifier that can be reused after the process exits.
6. **What does PPID mean?** It is the identifier of the observed parent process.
7. **How is PID reuse handled?** A mutation compares the supplied creation time with the current process identity before dispatch.
8. **How do permissions affect observations?** The OS can restrict counters or executable paths belonging to other users or protected services.
9. **Why require a session token?** It prevents arbitrary browser origins from invoking mutations through a local server.
10. **What is a PCB?** It is the textbook model of the kernel record for process identity, execution state, and resources.
11. **How does a process differ from a thread?** The process owns resources and address space. Threads share those resources and maintain independent execution contexts.
12. **Can a sleeping process be in the ready queue?** Observable sleep usually reflects a wait. The sampler has no access to the exact kernel ready queue.
13. **What is preemption?** The scheduler interrupts running work and gives CPU time to another runnable execution context.
14. **What is a context switch?** The kernel saves one execution context and restores another.
15. **Why can process CPU exceed 100%?** psutil reports relative to one logical core. A multithreaded process can occupy several.
16. **What is the difference between user time and system time?** User time tracks ordinary execution. System time tracks execution in kernel mode.
17. **What is load average?** It is a platform-defined measure of workload demand averaged over time, typically over one, five, and fifteen minutes.
18. **What is RSS?** The resident set size describes memory mappings backed by physical pages.
19. **What is VMS?** It is the size of mapped or reserved virtual address space.
20. **Why does the allocation lab touch pages?** Demand paging can defer physical backing until a page is accessed.
21. **What is swapping?** The OS uses a backing store to hold pages that need not remain in physical memory at the moment.
22. **What is thrashing?** Repeated displacement and retrieval of working-set pages can dominate progress.
23. **How is disk throughput computed?** Divide the increase in cumulative bytes by elapsed monotonic time.
24. **Why can counter rates be unavailable?** They require two valid observations and a nondecreasing counter.
25. **What is the CPython GIL?** In GIL-enabled builds it serializes Python bytecode execution within an interpreter.
26. **Why can threaded I/O run faster?** Threads can overlap while blocked on independent I/O operations.
27. **What makes multiprocessing useful for CPU workloads?** Separate processes have separate interpreters and can execute on multiple cores.
28. **What creates a counter race?** One worker can read a value before another writes its increment, causing one update to be overwritten.
29. **What does a mutex guarantee here?** Only one participant enters the shared counter critical section at a time.
30. **What does a bounded queue regulate?** It caps buffered items and coordinates producers and consumers through waiting and wakeup.
31. **How does consistent lock ordering prevent deadlock?** Acquiring resources in the same global order removes circular waiting.
32. **Why is high CPU a clue rather than proof of a bottleneck?** Some workloads intentionally use available cores. Validate impact with workload progress and response time.
