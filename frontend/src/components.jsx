import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowUpRight } from 'lucide-react'
import { num, time, bytes, pct, unavailable } from './data'

export function Panel({ title, subtitle, action, children, className = '' }) {
  return <section className={`panel ${className}`}>
    {title && <header className="panel-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header>}
    {children}
  </section>
}

export function Metric({ title, value, subtitle, icon: Icon, tone = 'blue', progress }) {
  return <article className={`metric ${tone}`}><div className="metric-top"><span>{title}</span><i><Icon size={17}/></i></div>
    <strong>{value}</strong><p>{subtitle}</p>
    {progress != null && <div className="track"><span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}/></div>}
  </article>
}

export function Chart({ title, subtitle, rows, series, max, format = num, compact = false }) {
  const range = max ? [0, max] : [0, 'auto']
  const hasData = rows.some(row => series.some(item => row[item.key] != null))
  return <Panel title={title} subtitle={subtitle} action={<div className="legend">
    {series.map(item => <span key={item.key}><i style={{ background: item.color }}/>{item.label}</span>)}
  </div>}>
    <div className={`chart ${compact ? 'compact' : ''}`}>{hasData
      ? <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5"/>
          <XAxis dataKey="time" tickFormatter={time} minTickGap={36} tick={{ fill: 'var(--muted)', fontSize: 10 }}
            axisLine={false} tickLine={false}/>
          <YAxis domain={range} tickFormatter={format} width={67} allowDecimals={false}
            tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false}/>
          <Tooltip labelFormatter={time} formatter={format} contentStyle={{
            background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)' }}/>
          {series.map(item => <Area key={item.key} name={item.label} dataKey={item.key} stroke={item.color}
            fill={item.color} fillOpacity={.09} strokeWidth={2} type="monotone" isAnimationActive={false}/>)}
        </AreaChart>
      </ResponsiveContainer> : <div className="empty">{rows.length ? unavailable : 'Waiting for host samples…'}</div>}
    </div>
  </Panel>
}

export function Facts({ items }) {
  return <dl className="facts">{items.map(([label, value]) =>
    <div key={label}><dt>{label}</dt><dd>{value == null || value === '—' ? unavailable : value}</dd></div>)}</dl>
}

export function Top({ title, rows = [], kind, open }) {
  return <Panel title={title}><div className="table-wrap"><table><thead><tr>
    <th>Process</th><th>PID</th><th>{kind === 'cpu' ? 'CPU' : 'RSS'}</th><th aria-label="Details"/>
  </tr></thead><tbody>{rows.map(row => <tr key={row.pid}>
    <td>{row.name ?? unavailable}</td><td className="mono">{row.pid}</td>
    <td className="mono">{kind === 'cpu' ? pct(row.cpu) : bytes(row.rss)}</td>
    <td><button className="icon-button" aria-label={`Inspect process ${row.pid}`} onClick={() => open(row)}><ArrowUpRight size={15}/></button></td>
  </tr>)}</tbody></table>{!rows.length && <div className="empty">No process readings available</div>}</div></Panel>
}

export function Message({ children }) {
  return children ? <div className="message" role="status">{children}</div> : null
}
