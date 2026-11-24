import { useEffect, useRef, useState } from 'react'
import { ArrowDownUp, Search, X } from 'lucide-react'
import { api, bytes, date, duration, num, pct, unavailable, useApi } from './data'
import { Facts, Message, Panel } from './components'

const columns = [
  ['pid', 'PID'], ['ppid', 'PPID'], ['name', 'Process'], ['status', 'State'], ['cpu', 'CPU', pct],
  ['memory_percent', 'Memory', pct], ['rss', 'RSS', bytes], ['vms', 'VMS', bytes],
  ['num_threads', 'Threads'], ['nice', 'Priority'], ['username', 'Owner'],
  ['create_time', 'Created', date], ['duration', 'Elapsed', duration], ['cpu_time', 'CPU time', value => value == null ? '—' : num(value) + ' s'],
]
const pageSize = 25
const windowsPriority = { 64: 19, 16384: 5, 32: 0, 32768: -5, 128: -10, 256: -20 }

export function ProcessTable({ open }) {
  const [rows, error] = useApi('/api/processes', 4000)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [owner, setOwner] = useState('')
  const [sort, setSort] = useState(['cpu', -1])
  const [page, setPage] = useState(0)
  const [key, direction] = sort
  const filtered = (rows ?? []).filter(row => {
    const term = query.trim().toLowerCase()
    return (!term || String(row.pid).includes(term) || row.name?.toLowerCase().includes(term)) &&
      (!status || row.status === status) && (!owner || row.username === owner)
  }).sort((a, b) => {
    if (a[key] == null) return b[key] == null ? 0 : 1
    if (b[key] == null) return -1
    return direction * (typeof a[key] === 'number' ? a[key] - b[key] : a[key].localeCompare(b[key]))
  })
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const current = Math.min(page, pages - 1)
  const choices = name => [...new Set((rows ?? []).map(row => row[name]).filter(Boolean))].sort()

  return <Panel title="Running processes" subtitle="Process CPU is expressed as a share of one logical core and can exceed 100%.">
    <div className="filters">
      <label className="search"><Search size={16}/><input placeholder="Search name or PID" aria-label="Search name or PID"
        value={query} onChange={event => { setQuery(event.target.value); setPage(0) }}/></label>
      <select aria-label="Process state" value={status} onChange={event => { setStatus(event.target.value); setPage(0) }}>
        <option value="">All states</option>{choices('status').map(x => <option key={x}>{x}</option>)}</select>
      <select aria-label="Process owner" value={owner} onChange={event => { setOwner(event.target.value); setPage(0) }}>
        <option value="">All owners</option>{choices('username').map(x => <option key={x}>{x}</option>)}</select>
    </div>
    <Message>{error}</Message><div className="table-wrap"><table className="process-table"><thead><tr>
      {columns.map(([field, label]) => <th key={field} aria-sort={key === field ? direction > 0 ? 'ascending' : 'descending' : 'none'}>
        <button className={key === field ? 'sorted' : ''} onClick={() => setSort([field, key === field ? -direction : 1])}>
          {label} <ArrowDownUp size={12}/></button></th>)}
    </tr></thead><tbody>{filtered.slice(current * pageSize, (current + 1) * pageSize).map(row =>
      <tr key={row.pid} className={row.cpu >= 50 || row.memory_percent >= 10 ? 'hot' : ''}>
        {columns.map(([field, , format]) => <td key={field} className={typeof row[field] === 'number' ? 'mono' : ''}>
          {field === 'name' ? <button className="text-button" onClick={() => open(row)}>{row.name || `PID ${row.pid}`}</button>
            : row[field] == null ? <span title={unavailable}>—</span> : format ? format(row[field]) : row[field]}
        </td>)}
      </tr>)}</tbody></table>
    {!filtered.length && <p className="empty">{rows === null ? 'Loading process readings…' : rows.length ? 'No matching processes' : 'Process inventory unavailable'}</p>}</div>
    <footer className="pagination"><p>{filtered.length} processes · Page {current + 1} of {pages}</p>
      <button disabled={!current} onClick={() => setPage(current - 1)}>Previous</button>
      <button disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Next</button>
    </footer>
  </Panel>
}

export function ProcessDetail({ row, close, os }) {
  const dialog = useRef(null)
  const [details, detailError] = useApi(`/api/processes/${row.pid}`, 3000)
  const [confirm, setConfirm] = useState('')
  const [priority, setPriority] = useState((os === 'Windows' ? windowsPriority[row.nice] : row.nice) ?? 0)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])
  const changed = details?.create_time != null && row.create_time !== details.create_time
  const permit = Boolean(row.create_time && !changed && !detailError && !busy)
  async function action() {
    setBusy(true)
    try {
      await api(`/api/processes/${row.pid}/${confirm}`, confirm === 'priority' ? 'PATCH' : 'POST',
        { create_time: row.create_time, confirmed: true, ...(confirm === 'priority' ? { priority: Number(priority) } : {}) })
      setMessage(`Requested ${confirm} for PID ${row.pid}.`)
      setConfirm('')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }
  return <dialog ref={dialog} onCancel={close} aria-labelledby="process-title" className="detail-dialog">
    <div className="panel-header"><div><h2 id="process-title">{row.name || 'Process'} · PID {row.pid}</h2>
      <p>{changed ? 'PID now belongs to a different process.' : details?.executable || 'Process inspection'}</p></div>
      <button className="icon-button" onClick={close} aria-label="Close process details"><X size={18}/></button></div>
    <Message>{message || detailError}</Message>
    <Facts items={columns.filter(([field]) => field !== 'name').map(([field, title, format]) =>
      [title, field === 'status' && !changed ? details?.status ?? row.status : format ? format(row[field]) : row[field]])}/>
    {!changed && <>
      <section className="detail-section"><h3>Process controls</h3>
        <div className="actions">{['suspend', 'resume', 'terminate', 'kill'].map(name => <button
          className={name === 'kill' ? 'danger' : ''} disabled={!permit || (os === 'Windows' && name === 'terminate')}
          key={name} onClick={() => { setConfirm(name); setMessage('') }}>{name === 'kill' ? 'Force kill' : name}</button>)}</div>
        {os === 'Windows' && <p className="muted">Graceful termination is unavailable for arbitrary Windows processes.</p>}
        <div className="actions"><label>Priority {os === 'Windows' ? <select value={priority}
          onChange={e => setPriority(e.target.value)}>{[[19, 'Idle'], [5, 'Below normal'], [0, 'Normal'], [-5, 'Above normal'],
          [-10, 'High'], [-20, 'Realtime']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          : <input type="number" min="-20" max="19" value={priority} onChange={e => setPriority(e.target.value)}/>}</label>
          <button disabled={!permit || priority === ''} onClick={() => { setConfirm('priority'); setMessage('') }}>Change priority</button></div>
        {confirm && <div className="confirm" role="group" aria-label="Confirm process action">
          <p>Confirm {confirm === 'priority' ? `priority change to ${priority} for` : confirm} PID {row.pid}?</p>
          <button disabled={busy} onClick={() => setConfirm('')}>Cancel</button>
          <button className="danger" disabled={!permit} onClick={action}>Confirm</button>
        </div>}
      </section>
      <section className="detail-section"><h3>Threads</h3>
        {details?.threads?.length ? <div className="table-wrap thread-list"><table><thead><tr><th>Thread ID</th><th>User seconds</th><th>System seconds</th></tr></thead>
          <tbody>{details.threads.map(t => <tr key={t.id}><td>{t.id}</td><td>{num(t.user_time)}</td><td>{num(t.system_time)}</td></tr>)}</tbody>
        </table></div> : <p className="muted">{details ? unavailable : 'Loading…'}</p>}
      </section>
      <section className="detail-section"><h3>Process I/O and context switches</h3>
        <Facts items={[...Object.entries(details?.io ?? {}), ...Object.entries(details?.context_switches ?? {})]
          .map(([key, value]) => [key.replaceAll('_', ' '), key.endsWith('_bytes') ? bytes(value) : num(value)])}/>
        {!Object.keys(details?.io ?? {}).length && <p className="muted">Process I/O · {unavailable}</p>}
      </section></>}
  </dialog>
}
