import { useState } from 'react'
import { Download, FlaskConical, Play, Square } from 'lucide-react'
import { api, bytes, date, duration, num, pct, speed, time, useApi } from './data'
import { Facts, Message, Panel } from './components'

const experiments = [
  ['cpu', 'CPU stress', 'Run a CPU-bound hashing loop in one child and observe its CPU time and per-core activity.'],
  ['memory', 'Memory allocation', 'Allocate and touch pages in a child. Compare its RSS and VMS with available host memory.'],
  ['threads', 'Sequential vs. threads', 'Compare sequential and concurrent reads from local sockets with a controlled producer delay. In standard GIL-enabled CPython, CPU-bound Python threads usually cannot execute Python bytecode in parallel.'],
  ['multiprocessing', 'Multiprocessing', 'Compare the same amount of CPU-bound hashing sequentially and across two spawned workers. Timing includes process startup.'],
  ['lifecycle', 'Process lifecycle', 'Observe a child as it starts, suspends, resumes, and terminates under your control.'],
  ['race', 'Race and synchronization', 'Compare a shared counter with and without a lock. A race can yield the expected count on some runs.'],
  ['buffer', 'Producer–consumer', 'Observe two threads using a three-slot queue, including occupancy and waiting events.'],
  ['deadlock', 'Deadlock detection', 'Observe two threads request locks in opposite order, recover with timeouts, and retry in a shared acquisition order.'],
]

export function Lab() {
  const [status, error, refresh] = useApi('/api/experiments/status', 700)
  const [kind, setKind] = useState('cpu')
  const [seconds, setSeconds] = useState(15)
  const [memory, setMemory] = useState(64)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const running = status?.state === 'running'
  async function call(action, body) {
    setBusy(true)
    setMessage('')
    try { await api(`/api/experiments/${action}`, 'POST', body); refresh() }
    catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }
  return <div className="stack"><div className="experiment-grid">{experiments.map(([key, title, description]) =>
    <button className={`experiment ${kind === key ? 'selected' : ''}`} aria-pressed={kind === key} key={key} disabled={running}
      onClick={() => setKind(key)}><FlaskConical size={17}/><span><b>{title}</b><small>{description}</small></span></button>)}</div>
    <Panel title="Experiment controls" subtitle="One experiment at a time. Maximum 30 seconds and up to 256 MiB of allocation.">
      <form className="actions" onSubmit={event => { event.preventDefault(); call('start', { kind, duration: +seconds, memory: +memory }) }}>
        <label>Duration limit (s) <input type="number" required min="3" max="30" value={seconds} disabled={running}
          onChange={event => setSeconds(event.target.value)}/></label>
        {kind === 'memory' && <label>Allocation (MiB) <input type="number" required min="1" max="256" value={memory}
          disabled={running} onChange={event => setMemory(event.target.value)}/></label>}
        <button className="primary" disabled={running || busy || !status}><Play size={14}/> Start experiment</button>
        <button type="button" className="danger" disabled={!running} onClick={() => call('stop')}><Square size={14}/> Emergency stop</button>
      </form>
      <Message>{message || error}</Message>
      {running && status.kind === 'lifecycle' && <div className="actions">{['suspend', 'resume', 'terminate'].map(action =>
        <button key={action} type="button" disabled={busy} onClick={() => call('lifecycle', { action })}>{action}</button>)}</div>}
      {status?.pid && <Facts items={[
        ['Experiment', status.kind], ['State', status.state], ['Child PID', status.pid], ['Parent PID', status.ppid],
        ['Observed child state', status.child?.status], ['Elapsed', duration(status.child?.elapsed)],
        ['Child CPU', pct(status.child?.cpu)], ['Child CPU time', status.child?.cpu_time == null ? null : `${num(status.child.cpu_time)} s`],
        ['Child RSS', bytes(status.child?.rss)], ['Child VMS', bytes(status.child?.vms)],
      ]}/>}
    </Panel>
    <Panel title="Host resource readings" subtitle="The next sampling cycle captures the post-experiment reading. Short experiments may finish between samples.">
      <div className="table-wrap"><table><thead><tr>
        {['Phase', 'Time', 'CPU', 'RAM', 'Available RAM', 'Swap', 'Disk read', 'Disk write', 'Logical cores'].map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{['before', 'during', 'after'].map(phase => {
          const point = status?.[phase]
          return <tr key={phase}><td>{phase}</td><td>{time(point?.time)}</td><td>{pct(point?.cpu)}</td>
            <td>{pct(point?.memory)}</td><td>{bytes(point?.available)}</td><td>{pct(point?.swap)}</td><td>{speed(point?.read)}</td>
            <td>{speed(point?.write)}</td><td>{point?.cores?.map(pct).join(' · ') || '—'}</td></tr>
        })}</tbody></table></div>
    </Panel>
    <Panel title="Recorded events">
      {status?.events?.length ? <div className="items event-list">{status.events.map(({ event, time: stamp, edges, ownership, occupancy, ...fields }, i) =>
        <article key={i}><time>{time(stamp)}</time><div><b>{event}</b>
          {edges && <div className="waitgraph" aria-label="Instrumented wait-for graph">
            <span>{ownership['Lock A']} owns Lock A</span><b>⇄</b><span>{ownership['Lock B']} owns Lock B</span>
            <small>{edges.join(' · ')}</small></div>}
          {occupancy != null && <div className="buffer" aria-label={`Buffer occupancy ${occupancy} of 3`}>
            {[0, 1, 2].map(slot => <i key={slot} className={slot < occupancy ? 'filled' : ''}/>)}<span>{occupancy} / 3</span></div>}
          {Object.keys(fields).length > 0 && <p>{Object.entries(fields).map(([key, value]) =>
            `${key}: ${typeof value === 'number' ? Number(value.toFixed(3)) : String(value)}`).join(' · ')}</p>}
        </div></article>)}</div> : <p className="empty">Experiment events will appear here.</p>}
    </Panel>
  </div>
}

export function Logs() {
  const [alerts, alertError, reload] = useApi('/api/alerts', 5000)
  const [logs, logError] = useApi('/api/logs', 5000)
  const [message, setMessage] = useState('')
  async function mark(id) {
    setMessage('')
    try { await api(`/api/alerts/${id}/read`, 'PATCH'); reload() }
    catch (error) { setMessage(error.message) }
  }
  return <div className="stack">
    <div className="actions exports">{['metrics', 'alerts', 'logs'].map(name =>
      <a key={name} className="button" href={`/api/export/${name}`}><Download size={15}/> Export {name} CSV</a>)}</div>
    <Panel title="Alerts" subtitle={`${alerts?.filter(item => !item.read).length ?? 0} unread in the latest results`}>
      <Message>{alertError || message}</Message>
      {alerts?.length ? <div className="items event-list">{alerts.map(alert => <article key={alert.id}>
        <span className={`tag ${alert.level}`}>{alert.level}</span>
        <div><b>{alert.message}</b><p>{alert.action}</p>
          <small>{date(alert.time)}{alert.pid != null && ` · PID ${alert.pid}`} · {alert.read ? 'Read' : 'Unread'}</small></div>
        {!alert.read && <button onClick={() => mark(alert.id)}>Mark read</button>}
      </article>)}</div> : <p className="empty">{alerts ? 'No alerts recorded' : 'Loading alerts…'}</p>}
    </Panel>
    <Panel title="Activity log"><Message>{logError}</Message>
      <div className="table-wrap event-list"><table><thead><tr><th>Time</th><th>Event</th><th>Result</th></tr></thead>
        <tbody>{logs?.map(log => <tr key={log.id}><td>{date(log.time)}</td><td>{log.event}</td><td>{log.result}</td></tr>)}</tbody>
      </table>{!logs?.length && <p className="empty">{logs ? 'No activity recorded' : 'Loading activity…'}</p>}</div>
    </Panel>
  </div>
}

const fields = [
  ['interval', 'Sampling interval (s)', 1, 10, .5], ['sustain', 'Sustained window (s)', 10, 300, 1],
  ['cpu', 'CPU utilization (%)', 1, 100, 1], ['memory', 'Memory utilization (%)', 1, 100, 1],
  ['swap', 'Swap utilization (%)', 1, 100, 1], ['disk', 'Disk capacity used (%)', 1, 100, 1],
  ['io', 'Combined disk I/O (MiB/s)', 1, 10000, 1],
]
export function Preferences({ theme, setTheme }) {
  const [settings, error] = useApi('/api/settings')
  const [modified, setModified] = useState(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const values = modified ?? settings
  async function save(event) {
    event.preventDefault()
    setMessage('')
    setSaving(true)
    try { setModified(await api('/api/settings', 'PUT', values)); setMessage('Settings saved.') }
    catch (error) { setMessage(error.message) }
    finally { setSaving(false) }
  }
  return <div className="stack">
    <Panel title="Appearance"><div className="actions"><label>Theme <select value={theme} onChange={event => setTheme(event.target.value)}>
      <option value="dark">Dark</option><option value="light">Light</option></select></label></div></Panel>
    <Panel title="Sampling and thresholds" subtitle="Thresholds apply to future observations. Alert keys have a five-minute cooldown.">
      <Message>{error || message}</Message>{values ? <form className="settings-form" onSubmit={save}>
        {fields.map(([name, label, min, max, step]) => <label key={name}>{label}
          <input required type="number" {...{ min, max, step }} value={values[name]} onChange={event =>
            setModified({ ...values, [name]: event.target.value === '' ? '' : +event.target.value })}/></label>)}
        <div><button className="primary" disabled={saving}>Save settings</button></div>
      </form> : <p className="empty">Loading settings…</p>}
    </Panel>
  </div>
}
