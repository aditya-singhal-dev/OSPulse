import { useMemo, useState } from 'react'
import { Background, Controls, Handle, Position, ReactFlow } from '@xyflow/react'
import { Search } from 'lucide-react'
import { useApi, pct } from './data'
import { Concepts } from './analytics'
import { Panel, Message } from './components'
import '@xyflow/react/dist/style.css'

function ProcessNode({ data }) {
  return <div className={`tree-node ${data.match ? 'match' : ''}`}>
    <Handle type="target" position={Position.Left}/><Handle type="source" position={Position.Right}/>
    <button className="text-button" onClick={() => data.open(data.row)}>{data.row.name || 'Restricted process'}</button>
    <small>PID {data.row.pid} · {pct(data.row.cpu)} CPU · {data.row.status ?? 'unknown'}</small>
    {data.count > 0 && <button className="nodrag" onClick={() => data.toggle(data.row.pid)}>
      {data.collapsed ? 'Expand' : 'Collapse'} {data.count} direct {data.count === 1 ? 'child' : 'children'}</button>}
  </div>
}
const nodeTypes = { process: ProcessNode }
const initialViewport = { x: 24, y: 24, zoom: 1 }

export default function Tree({ open }) {
  const [rows, error] = useApi('/api/processes/tree', 5000)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState(new Set([1]))
  const term = query.trim().toLowerCase()
  const { nodes, edges, matches } = useMemo(() => {
    const groups = new Map(), index = new Map(), matching = new Set(), visible = new Set()
    for (const row of rows ?? []) {
      index.set(row.pid, row)
      if (!groups.has(row.parent)) groups.set(row.parent, [])
      groups.get(row.parent).push(row)
    }
    if (term) for (const row of rows ?? []) {
      if (row.name?.toLowerCase().includes(term) || String(row.pid).includes(term)) {
        matching.add(row.pid)
        let ancestor = row
        while (ancestor && !visible.has(ancestor.pid)) {
          visible.add(ancestor.pid)
          ancestor = index.get(ancestor.parent)
        }
      }
    }
    const nodes = [], edges = [], visited = new Set()
    const toggle = pid => setCollapsed(current => {
      const next = new Set(current)
      if (next.has(pid)) next.delete(pid)
      else next.add(pid)
      return next
    })
    const todo = (groups.get(null) ?? []).slice().reverse().map(row => [row, 0])
    while (todo.length) {
      const [row, depth] = todo.pop()
      if (visited.has(row.pid) || (term && !visible.has(row.pid))) continue
      visited.add(row.pid)
      const children = groups.get(row.pid) ?? []
      const id = String(row.pid)
      nodes.push({ id, type: 'process', position: { x: Math.min(30, depth) * 245, y: nodes.length * 105 },
        data: { row, count: children.length, collapsed: collapsed.has(row.pid) && !term, match: matching.has(row.pid), open, toggle } })
      if (row.parent != null && visited.has(row.parent)) edges.push({
        id: `${row.parent}-${id}`, source: String(row.parent), target: id, type: 'smoothstep',
        style: { stroke: term ? 'var(--blue)' : 'var(--muted)' },
      })
      if (!collapsed.has(row.pid) || term) for (let i = children.length - 1; i >= 0; i--) todo.push([children[i], depth + 1])
    }
    return { nodes, edges, matches: matching.size }
  }, [rows, collapsed, term, open])
  return <div className="stack"><Panel title="Parent-child relationships">
    <div className="filters"><label className="search"><Search size={16}/>
      <input placeholder="Find a process or PID" aria-label="Find a process or PID" value={query} onChange={e => setQuery(e.target.value)}/></label>
      <button onClick={() => { setCollapsed(new Set()); setQuery('') }}>Expand all</button>
      <button onClick={() => { setCollapsed(new Set((rows ?? []).map(r => r.pid))); setQuery('') }}>Collapse all</button>
      <span className="muted">{term ? `${matches} matches` : `${nodes.length} visible`}</span></div>
    <Message>{error}</Message>
    <div className="flow">{nodes.length ? <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes}
      defaultViewport={initialViewport} minZoom={.03} nodesDraggable={false} nodesConnectable={false} onlyRenderVisibleElements>
      <Background color="var(--line)"/><Controls/></ReactFlow> : <p className="empty">{term ? 'No matching processes' : 'No process hierarchy readings available'}</p>}</div>
  </Panel><Concepts kind="tree"/></div>
}
