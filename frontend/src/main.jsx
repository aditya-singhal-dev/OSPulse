import { lazy, Suspense, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { motion, useReducedMotion } from 'framer-motion'
import { Activity, Bell, ChevronLeft, CircleHelp, Cpu, FlaskConical, GitFork, HardDrive,
  HeartPulse, LayoutDashboard, List, MemoryStick, Monitor, PanelLeft, Settings2, Workflow } from 'lucide-react'
import { duration, time, useApi, useLive } from './data'
import { Message } from './components'
import { Analytics, Overview, About } from './analytics'
import { ProcessDetail, ProcessTable } from './processes'
import { Lab, Logs, Preferences } from './operations'
import './style.css'

const Tree = lazy(() => import('./tree'))
const pages = [
  ['overview', 'System Overview', LayoutDashboard, 'Observe the resources and workloads on this host.'],
  ['processes', 'Process Manager', List, 'Inspect, filter, and manage running processes.'],
  ['cpu', 'CPU Analytics', Cpu, 'Explore processor activity, load, and utilization per core.'],
  ['memory', 'Memory Analytics', MemoryStick, 'Inspect physical memory, swap, and resident workloads.'],
  ['disk', 'Disk and I/O', HardDrive, 'Measure storage capacity and live I/O throughput.'],
  ['tree', 'Process Tree', GitFork, 'Follow parent and child relationships reported by the host.'],
  ['threads', 'Threads and Scheduling', Workflow, 'Explore observable process states and thread activity.'],
  ['health', 'System Health', HeartPulse, 'Review the health heuristic and sustained resource observations.'],
  ['lab', 'OS Experiment Lab', FlaskConical, 'Run bounded workloads on this host and observe their effects.'],
  ['logs', 'Alerts and Activity Logs', Bell, 'Review resource observations and operational history.'],
  ['settings', 'Settings', Settings2, 'Configure sampling, alert thresholds, and appearance.'],
  ['about', 'About and OS Concepts', CircleHelp, 'Connect measured host behavior to operating systems concepts.'],
]

function route() {
  const hash = location.hash.slice(1)
  return pages.some(([key]) => key === hash) ? hash : 'overview'
}

function App() {
  const [page, setPage] = useState(route)
  const [collapsed, setCollapsed] = useState(false)
  const [selected, setSelected] = useState(null)
  const [theme, setTheme] = useState(() => localStorage.getItem('os-pulse-theme') || 'dark')
  const { snapshot, history, connection } = useLive()
  const [info, infoError] = useApi('/api/system/info', 10000)
  const reduced = useReducedMotion()
  const [key, title, , subtitle] = pages.find(([id]) => id === page)
  useEffect(() => {
    const update = () => setPage(route())
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('os-pulse-theme', theme)
  }, [theme])
  const monitoringPage = ['overview', 'cpu', 'memory', 'disk', 'threads', 'health'].includes(key)
  return <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
    <aside className="sidebar">
      <a className="brand" href="#overview"><span className="brand-mark"><Activity size={23}/></span>
        <span className="side-text"><b>OS Pulse</b><small>System Monitor</small></span></a>
      <nav aria-label="Primary">
        {pages.map(([id, label, Icon], index) => <div key={id}>
          {[0, 5, 8, 10].includes(index) && <p className="nav-group">{({ 0: 'MONITOR', 5: 'ANALYZE', 8: 'OPERATE', 10: 'SYSTEM' })[index]}</p>}
          <a href={`#${id}`} aria-current={id === page ? 'page' : undefined} title={label} aria-label={label}>
            <Icon size={17}/><span className="side-text">{label}</span>
          </a>
        </div>)}
      </nav>
      <button className="collapse" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        onClick={() => setCollapsed(!collapsed)}>{collapsed ? <PanelLeft size={16}/> : <ChevronLeft size={16}/>}
        <span className="side-text">Collapse sidebar</span></button>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="host"><Monitor size={16}/>
        <b>{info?.hostname || 'Local host'}</b><span>{info ? `${info.os} ${info.version}` : '—'}</span>
        <span>Uptime {duration(snapshot?.uptime)}</span></div>
        <div className="connection"><span>Updated {time(snapshot?.time)}</span>
          <b className={connection === 'Live' && !snapshot?.error ? 'live' : 'offline'}><i/>{snapshot?.error ? 'Degraded' : connection}</b>
        </div></header>
      <main>
        <motion.div key={key} initial={reduced ? false : { opacity: .7, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .15 }}>
          <div className="page-head"><div><h1>{title}</h1><p>{subtitle}</p></div>
            {key === 'overview' && <a className="button" href="#processes"><List size={16}/> View processes</a>}</div>
          <Message>{snapshot?.error || infoError}</Message>
          {monitoringPage && !snapshot?.time ? <div className="skeleton-grid" aria-label="Waiting for host metrics">{Array.from({ length: 8 }, (_, i) => <div key={i}/>)}</div> : null}
          {key === 'overview' && snapshot?.time && <Overview snapshot={snapshot} info={info} history={history} open={setSelected}/>}
          {['cpu', 'memory', 'disk', 'threads', 'health'].includes(key) && snapshot?.time &&
            <Analytics key={key} page={key} snapshot={snapshot} info={info} history={history} open={setSelected}/>}
          {key === 'processes' && <ProcessTable open={setSelected}/>}
          {key === 'tree' && <Suspense fallback={<p className="empty">Loading process visualization…</p>}><Tree open={setSelected}/></Suspense>}
          {key === 'lab' && <Lab/>}{key === 'logs' && <Logs/>}
          {key === 'settings' && <Preferences theme={theme} setTheme={setTheme}/>}
          {key === 'about' && <About/>}
        </motion.div>
      </main>
    </div>
    {selected && <ProcessDetail key={selected.pid} row={selected} close={() => setSelected(null)} os={info?.os}/>}
  </div>
}

createRoot(document.getElementById('root')).render(<App/>)
