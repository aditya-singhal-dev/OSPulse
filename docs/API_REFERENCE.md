# API reference

The backend listens at `http://127.0.0.1:8000`. FastAPI provides OpenAPI JSON at `/openapi.json` and interactive docs at `/docs`. Browser origins on `127.0.0.1` or `localhost` at ports 4173, 5173, and 8000 are allowed.

| Method and path | Response or behavior |
|---|---|
| GET /api/system/info | Cached operating system, host, CPU, RAM, and boot metadata. |
| GET /api/system/overview | Latest host sample excluding the full process inventory. Startup can return an empty object. |
| GET /api/cpu, /api/memory, /api/disk, /api/health | Latest section of the host sample. |
| GET /api/processes | Latest visible process inventory. |
| GET /api/processes/tree | Rows with a validated parent PID or null. |
| GET /api/processes/{pid} | Current accessible threads, context switches, executable, I/O, identity and state. |
| POST /api/processes/{pid}/{action} | Action is `suspend`, `resume`, `terminate`, or `kill`. Requires creation time and confirmation. |
| PATCH /api/processes/{pid}/priority | Same identity fields plus integer priority −20 through 19. Windows maps 19, 5, 0, −5, −10, and −20 to priority classes. |
| GET /api/history?limit=300 | Chronological recent points from memory and SQLite. Maximum 3,600. |
| GET /api/alerts, /api/logs | Latest entries first. The optional limit is 1–1,000. |
| PATCH /api/alerts/{id}/read | Marks an alert read. |
| GET /api/export/{table} | CSV attachment for `metrics`, `alerts`, or `logs`. |
| GET /api/settings | Current refresh interval and thresholds. |
| PUT /api/settings | Persists all provided settings. |
| POST /api/experiments/start | Starts a lab run. Send kind, duration in seconds and optional memory in MiB. |
| POST /api/experiments/stop | Requests cancellation. |
| POST /api/experiments/lifecycle | Sends suspend, resume or terminate to the active lifecycle experiment child. |
| GET /api/experiments/status | Current or most recent run, own-child observations and events. |
| GET /api/session | Returns the per-launch local mutation token. |
| WS /ws/metrics | Periodic JSON overview snapshots. Requires a permitted browser Origin. |

Send the session token as `X-OS-Pulse-Token` on POST, PATCH, and PUT. A process action accepts `{"create_time": 1700000000.0, "confirmed": true}`, using the exact creation time from the observed row. A successful control means the operation was dispatched. Verify the subsequent process state separately. HTTP 403 means forbidden, 404 means absent, 409 means a stale identity, state conflict or rejected operation, 422 means invalid input, and 501 means a platform operation is unavailable.

Timestamps are Unix seconds. RAM and disk capacities use bytes. Disk throughput uses bytes per second and the UI formats it in binary units. Process CPU can exceed 100% across multiple logical CPUs. Missing values are null or omitted from platform-specific records.
