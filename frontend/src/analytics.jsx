import { Clock, Cpu, Gauge, HardDrive, Layers, List, MemoryStick, Workflow } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Chart, Facts, Message, Metric, Panel, Top } from './components'
import { bytes, date, duration, num, pct, speed, unavailable, useApi } from './data'

const blue = '#67a2ff', cyan = '#45d8dc', purple = '#b49aff', green = '#53d9a3'
const cpuLine = [{ key: 'cpu', label: 'CPU', color: blue }]
const memoryLine = [{ key: 'memory', label: 'Memory', color: purple }]
const ioLines = [{ key: 'read', label: 'Read', color: cyan }, { key: 'write', label: 'Write', color: purple }]

const concepts = {
  cpu: [
    ['CPU scheduling', 'The scheduler selects runnable threads to execute. Priorities and scheduling classes influence that decision. psutil exposes sampled utilization and observable states.'],
    ['Context switching', 'The kernel saves one execution context and restores another. A system-wide counter aggregates many unrelated workloads.'],
    ['User and kernel modes', 'Application code typically runs in user mode. System calls and interrupt handling execute privileged kernel code.'],
    ['CPU-bound and I/O-bound', 'CPU-bound work is constrained by computation. I/O-bound work often waits on storage, networking, or another device.'],
    ['Multiprocessing and multitasking', 'Independent processes can execute in parallel across cores. A single core can also interleave tasks over time.'],
  ],
  memory: [
    ['Physical and virtual memory', 'Physical memory is RAM. Virtual address spaces provide isolation and mappings to resident pages, files, or backing storage.'],
    ['RSS and VMS', 'RSS counts resident mappings and may include pages shared with other processes. VMS measures virtual address space, including reserved or nonresident mappings.'],
    ['Paging and swapping', 'Paging manages fixed-size virtual pages. Swap can back inactive anonymous pages and keep physical RAM available.'],
    ['Demand paging and page faults', 'A page fault can occur when a referenced mapping is unavailable. The kernel may load or allocate the page, or reject an invalid access.'],
    ['Fragmentation', 'Internal fragmentation wastes space inside an allocation unit. External fragmentation leaves free regions split across an address space or allocator.'],
    ['Thrashing', 'Frequent replacement and reloading of working-set pages can dominate execution. Swap occupancy alone cannot establish thrashing.'],
  ],
  disk: [
    ['File systems', 'A file system maps paths and metadata to stored data. Mounted volumes can share physical devices or capacity pools.'],
    ['Secondary storage', 'The kernel allocates blocks and coordinates persistent reads and writes with drivers and devices.'],
    ['I/O and disk scheduling', 'The storage stack queues requests and may reorder or merge operations. Device technology and operating system policy affect the result.'],
    ['Buffering and caching', 'Buffers absorb rate differences. Caches serve repeated access from faster storage. Cached reads may produce little physical device traffic.'],
  ],
  threads: [
    ['Processes and threads', 'A process supplies an address space and resources. Threads in a process share those resources and have separate stacks and execution contexts.'],
    ['User-level and kernel-level threads', 'User-space runtimes can schedule tasks onto threads. The kernel schedules the execution contexts it tracks.'],
    ['Preemptive and non-preemptive scheduling', 'A preemptive scheduler can interrupt running work. Cooperative scheduling relies on work yielding or blocking.'],
    ['Process Control Block', 'A PCB is a conceptual kernel record for process identity, state, and resource references. Kernel data structures vary.'],
    ['Context switching', 'A switch saves registers and execution state before restoring another context. Sleeping processes may be waiting for time, I/O, or synchronization.'],
  ],
  tree: [
    ['Process hierarchy', 'A process can create a child using operating system facilities. The OS records a parent identifier, which can change after reparenting. Restricted or exited parents can be absent from a sample.'],
  ],
}

export function Concepts({ kind }) {
  return <Panel title="Operating systems concepts"><div className="concepts">{concepts[kind].map(([name, body]) =>
    <details key={name}><summary>{name}</summary><p>{body}</p></details>)}</div></Panel>
}

export function Overview({ snapshot: s, info, history, open }) {
  const disk = s.disk.percent, swap = s.swap.percent, cpu = s.cpu.percent, memory = s.memory.percent
  const cards = [
    ['CPU utilization', pct(cpu), `${num(info?.logical)} logical cores`, Cpu, 'blue', cpu],
    ['Memory usage', pct(memory), `${bytes(s.memory.available)} available`, MemoryStick, 'purple', memory],
    ['Swap usage', pct(swap), s.swap.total != null ? `${bytes(s.swap.used)} of ${bytes(s.swap.total)}` : unavailable, Layers, 'cyan', swap],
    ['Disk usage', pct(disk), `${bytes(s.disk.free)} available`, HardDrive, 'amber', disk],
    ['Processes', num(s.process_count), 'Visible process inventory', List, 'blue'],
    ['Threads', num(s.thread_count), 'Accessible thread count', Workflow, 'purple'],
    ['System uptime', duration(s.uptime), info?.boot ? `Booted ${date(info.boot)}` : unavailable, Clock, 'cyan'],
    ['Health score', s.health.score == null ? '—' : `${s.health.score} / 100`, s.health.label || unavailable, Gauge,
      s.health.score >= 80 ? 'green' : s.health.score >= 40 ? 'amber' : 'red', s.health.score],
  ]
  return <div className="stack">
    <div className="metric-grid">{cards.map(([title, value, subtitle, icon, tone, progress]) =>
      <Metric key={title} {...{ title, value, subtitle, icon, tone, progress }}/>)}</div>
    <div className="two"><Chart title="CPU utilization" subtitle="Overall logical CPU activity" rows={history} series={cpuLine} format={pct} max={100}/>
      <Chart title="Memory utilization" subtitle="Share of physical memory in use" rows={history} series={memoryLine} format={pct} max={100}/></div>
    <div className="two"><Chart title="Disk throughput" rows={history} series={ioLines} format={speed}/>
      <Chart title="Process count" rows={history} series={[{ key: 'processes', label: 'Processes', color: blue }]}/></div>
    <div className="two"><Top title="Top CPU processes" rows={s.top_cpu} kind="cpu" open={open}/>
      <Top title="Top memory processes" rows={s.top_memory} open={open}/></div>
    <Panel title="System information"><Facts items={[
      ['Hostname', info?.hostname], ['Operating system', info && `${info.os} ${info.version}`],
      ['Architecture', info?.architecture], ['Processor', info?.processor], ['Physical cores', info?.physical],
      ['Logical cores', info?.logical], ['Installed RAM', bytes(info?.ram)], ['Boot time', date(info?.boot)],
    ]}/></Panel>
  </div>
}

function CPU({ snapshot: s, info, history, open }) {
  const [cores, setCores] = useState([])
  useEffect(() => {
    if (s.time && s.cpu.cores.length) {
      setCores(current => current.at(-1)?.time === s.time ? current :
        [...current.slice(-179), { time: s.time, ...Object.fromEntries(s.cpu.cores.map((value, index) => [`core${index}`, value])) }])
    }
  }, [s])
  return <>
    <Chart title="Overall CPU" rows={history} series={cpuLine} max={100} format={pct}/>
    <Panel title="Processor counters"><Facts items={[
      ['Physical cores', num(info?.physical)], ['Logical cores', num(info?.logical)],
      ['Current frequency', s.cpu.frequency.current == null ? null : `${num(s.cpu.frequency.current)} MHz`],
      ['User time share', pct(s.cpu.times.user)], ['System time share', pct(s.cpu.times.system)],
      ['Idle time share', pct(s.cpu.times.idle)], ['I/O wait share', pct(s.cpu.times.iowait)],
      ['Context switches', num(s.cpu.stats.ctx_switches)], ['Context switches / s', num(s.cpu.switch_rate)],
      ['Interrupts', num(s.cpu.stats.interrupts)], ['Load average · 1, 5, 15 min', s.cpu.load?.map(num).join(' / ')],
    ]}/></Panel>
    <div className="two">{s.cpu.cores.map((value, i) => <Chart compact key={i} title={`Logical core ${i + 1} · ${pct(value)}`}
      rows={cores} series={[{ key: `core${i}`, label: 'Utilization', color: blue }]} max={100} format={pct}/>)}</div>
    <Top title="Top CPU processes" rows={s.top_cpu} kind="cpu" open={open}/>
  </>
}

function Memory({ snapshot: s, history, open }) {
  const m = s.memory, w = s.swap
  return <>
    <Chart title="Physical memory and swap history" rows={history}
      series={[...memoryLine, { key: 'swap', label: 'Swap', color: cyan }]} max={100} format={pct}/>
    <Panel title="Physical memory breakdown" subtitle="Platform counters can overlap. Each bar is relative to installed RAM.">
      <div className="bars">{['used', 'available', 'free', 'cached', 'wired', 'inactive'].map(key => <div key={key}>
        <span>{key}</span><div className="track"><span style={{ width: `${m[key] == null ? 0 : Math.min(100, 100 * m[key] / m.total)}%` }}/></div>
        <b>{m[key] == null ? unavailable : bytes(m[key])}</b></div>)}</div>
      <Facts items={[['Total RAM', bytes(m.total)], ['Swap total', bytes(w.total)],
        ['Swap used', bytes(w.used)], ['Swap-in counter', bytes(w.sin)], ['Swap-out counter', bytes(w.sout)]]}/>
    </Panel>
    <Top title="Top resident memory processes" rows={s.top_memory} open={open}/>
    <Panel title="Memory observations">{s.observations.filter(item => item.key.startsWith('memory')).map(item =>
      <Message key={item.key}>{item.message}</Message>)}
    {!s.observations.some(item => item.key.startsWith('memory')) && <p className="empty">No active memory threshold or trend observations</p>}</Panel>
  </>
}

function Disk({ snapshot: s, history }) {
  const d = s.disk
  return <>
    <Chart title="Throughput" rows={history} series={ioLines} format={speed}/>
    <Panel title="Storage and I/O counters"><Facts items={[
      ['Capacity', bytes(d.total)], ['Used', bytes(d.used)], ['Available', bytes(d.free)],
      ['Read throughput', speed(d.rates.read_bytes)], ['Write throughput', speed(d.rates.write_bytes)],
      ['Read operations / s', num(d.rates.read_count)], ['Write operations / s', num(d.rates.write_count)],
      ...Object.entries(d.counters).map(([key, value]) => [key.replaceAll('_', ' '), key.endsWith('_bytes') ? bytes(value) :
        key.endsWith('_time') ? `${num(value)} ms` : num(value)]),
    ]}/></Panel>
    <Panel title="Mounted partitions" subtitle="Per-process I/O counters are available in Process Manager where supported.">
      <div className="table-wrap"><table><thead><tr>{['Mount', 'Device', 'File system', 'Capacity', 'Used'].map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{d.partitions.map((p, i) => <tr key={i}><td>{p.mountpoint}</td><td>{p.device}</td><td>{p.fstype}</td>
          <td>{bytes(p.total)}</td><td><div className="partition"><div className="track"><span style={{ width: `${p.percent || 0}%` }}/></div>{pct(p.percent)}</div></td></tr>)}</tbody>
      </table>{!d.partitions.length && <p className="empty">{unavailable}</p>}</div>
    </Panel>
  </>
}

function Threads({ snapshot: s, open }) {
  const [rows, error] = useApi('/api/processes', 4000)
  const counts = {}
  for (const row of rows ?? []) {
    const state = row.status || 'Unreported'
    counts[state] = (counts[state] || 0) + 1
  }
  return <>
    <Panel title="Process lifecycle" subtitle="Conceptual OS model">
      <div className="lifecycle">New → Ready ⇄ Running → Terminated<br/><span>Ready ← Waiting ← Running</span></div>
      <p className="body-copy">A scheduler dispatches ready work. Running work can block, return to ready when an event occurs, or exit.</p>
    </Panel>
    <Panel title="Observable states and context switching"><Message>{error}</Message>
      <Facts items={[['Accessible threads', num(s.thread_count)], ['Context switches', num(s.cpu.stats.ctx_switches)],
        ['Context switches / s', num(s.cpu.switch_rate)], ...Object.entries(counts).map(([status, count]) => [status, num(count)])]}/></Panel>
    <Panel title="Processes by thread count" subtitle="Open a row to inspect accessible thread identifiers and CPU times.">
      <div className="table-wrap"><table><thead><tr>{['Process', 'PID', 'Threads', 'Priority', 'State'].map(x => <th key={x}>{x}</th>)}</tr></thead>
        <tbody>{[...(rows ?? [])].sort((a, b) => (b.num_threads ?? -1) - (a.num_threads ?? -1)).slice(0, 15).map(p =>
          <tr key={p.pid}><td><button className="text-button" onClick={() => open(p)}>{p.name || p.pid}</button></td>
            <td>{p.pid}</td><td>{num(p.num_threads)}</td><td>{num(p.nice)}</td><td>{p.status || '—'}</td></tr>)}</tbody></table>
        {!rows?.length && <p className="empty">No accessible process readings</p>}</div>
    </Panel>
  </>
}

function Health({ snapshot: s, history }) {
  const h = s.health
  return <>
    <Panel title={`${h.score ?? '—'} / 100 · ${h.label ?? unavailable}`}
      subtitle="Application-defined heuristic based on up to 30 seconds of available host readings.">
      <div className="bars">{h.contributions.map(item => <div key={item.metric}>
        <span>{item.metric} · weight {pct(item.weight * 100)}</span>
        <div className="track"><span style={{ width: `${item.pressure}%` }}/></div><b>−{num(item.deduction)} points</b>
      </div>)}</div><ul className="recommendations">{h.contributions.filter(item => item.pressure >= 60)
        .map(item => <li key={item.metric}>{item.metric} pressure {pct(item.pressure)}. {item.recommendation}</li>)}</ul>
    </Panel>
    <Chart title="Health history" rows={history} series={[{ key: 'health', label: 'Score', color: green }]} max={100}/>
    <Panel title="Performance observations" subtitle="High utilization can suggest where to investigate. Confirm impact alongside workload and latency.">
      {s.observations.length ? <div className="items">{s.observations.map(item => <article key={item.key}>
        <span className={`tag ${item.level}`}>{item.level}</span><div><b>{item.message}</b><p>{item.action}</p></div>
      </article>)}</div> : <p className="empty">No active observations</p>}
    </Panel>
  </>
}

export function Analytics({ page, ...props }) {
  const View = { cpu: CPU, memory: Memory, disk: Disk, threads: Threads, health: Health }[page]
  return <div className="stack"><View {...props}/>{concepts[page] && <Concepts kind={page}/>}</div>
}

export function About() {
  return <div className="stack"><Panel title="OS Pulse" subtitle="Real-Time System Monitor and Process Manager">
    <p className="body-copy">OS Pulse is a local Operating Systems course project. A Python sampler reads host counters, a WebSocket delivers live measurements, and SQLite retains history, alerts, and operational records. The lab runs bounded workloads in child processes.</p>
  </Panel>{Object.keys(concepts).map(kind => <Concepts key={kind} kind={kind}/>)}</div>
}
