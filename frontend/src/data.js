import { useEffect, useState } from 'react'

let token
export async function api(path, method = 'GET', body) {
  if (method !== 'GET' && !token) token = (await api('/api/session')).token
  const response = await fetch(path, { method, headers: {
    ...(method === 'GET' ? {} : { 'X-OS-Pulse-Token': token }),
    ...(body ? { 'Content-Type': 'application/json' } : {}),
  }, body: body ? JSON.stringify(body) : undefined })
  if (!response.ok) {
    if (response.status === 403 && method !== 'GET') token = undefined
    const payload = await response.json().catch(() => ({}))
    throw Error(typeof payload.detail === 'string' ? payload.detail :
      payload.detail?.map(error => error.msg).join(' · ') || `Request failed (${response.status})`)
  }
  return response.json()
}

export function useApi(path, period = 0) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!path) return
    let active = true
    let timer
    async function refresh() {
      try {
        const value = await api(path)
        if (active) { setData(value); setError('') }
      } catch (error) {
        if (active) setError(error.message)
      } finally {
        if (active && period) timer = setTimeout(refresh, period)
      }
    }
    refresh()
    return () => { active = false; clearTimeout(timer) }
  }, [path, period, revision])
  return [data, error, () => setRevision(value => value + 1)]
}

export function useLive() {
  const [snapshot, setSnapshot] = useState(null)
  const [history, setHistory] = useState([])
  const [connection, setConnection] = useState('Connecting')
  useEffect(() => {
    let socket, timer
    let active = true
    let delay = 1000
    api('/api/history').then(rows => {
      if (active) setHistory(current => [...new Map([...rows, ...current].map(row => [row.time, row])).values()]
        .sort((a, b) => a.time - b.time).slice(-300))
    }).catch(() => {})
    function connect() {
      const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:'
      socket = new WebSocket(`${scheme}//${location.host}/ws/metrics`)
      socket.onopen = () => { delay = 1000; setConnection('Live') }
      socket.onmessage = event => {
        const data = JSON.parse(event.data)
        setSnapshot(data)
        if (data.point) setHistory(current => current.at(-1)?.time === data.point.time
          ? current : [...current.slice(-299), data.point])
      }
      socket.onerror = () => socket.close()
      socket.onclose = () => {
        if (!active) return
        setConnection('Reconnecting')
        timer = setTimeout(connect, delay)
        delay = Math.min(15000, delay * 2)
      }
    }
    connect()
    return () => { active = false; clearTimeout(timer); socket.close() }
  }, [])
  return { snapshot, history, connection }
}

export const unavailable = 'Not available on this platform'
export const num = value => value == null ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })
export const pct = value => value == null ? '—' : `${num(value)}%`
export function bytes(value) {
  if (value == null) return '—'
  let index = 0
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++ }
  return `${num(value)} ${units[index]}`
}
export const time = value => value == null ? '—' : new Date(value * 1000).toLocaleTimeString()
export const date = value => value == null ? '—' : new Date(value * 1000).toLocaleString()
export function duration(value) {
  if (value == null) return '—'
  const seconds = Math.floor(value)
  if (seconds < 60) return `${seconds}s`
  const hours = Math.floor(seconds / 3600)
  const days = Math.floor(hours / 24)
  return [days ? `${days}d` : '', hours ? `${hours % 24}h` : '', `${Math.floor(seconds % 3600 / 60)}m`].filter(Boolean).join(' ')
}
export const speed = value => value == null ? '—' : `${bytes(value)}/s`
