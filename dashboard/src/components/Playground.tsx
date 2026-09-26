import { useState, useRef, useEffect } from 'react'
import './Playground.css'

type ConnStatus = 'connecting' | 'accepted' | 'rejected' | 'closed'

interface ManagedConnection {
  id: string
  clientId: string
  ws: WebSocket
  status: ConnStatus
  sessionId?: string
  nodeId?: string
  reason?: string
  openedAt: number
}

const WS_BASE = `ws://${window.location.hostname}:8080/ws`

function shortId(): string {
  return Math.random().toString(36).slice(2, 8)
}

export default function Playground() {
  const [orgId, setOrgId] = useState('playground-org')
  const [limitInput, setLimitInput] = useState('5')
  const [connections, setConnections] = useState<ManagedConnection[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const connectionsRef = useRef<ManagedConnection[]>([])

  useEffect(() => {
    connectionsRef.current = connections
  }, [connections])

  useEffect(() => {
    return () => {
      connectionsRef.current.forEach((c) => {
        try { c.ws.close() } catch { /* noop */ }
      })
    }
  }, [])

  const flash = (msg: string) => {
    setNotice(msg)
    setTimeout(() => setNotice(null), 2500)
  }

  const updateConn = (id: string, patch: Partial<ManagedConnection>) => {
    setConnections((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  const openOne = () => {
    const clientId = `c-${shortId()}`
    const localId = shortId()
    const url = `${WS_BASE}?organizationId=${encodeURIComponent(orgId)}&clientId=${encodeURIComponent(clientId)}`

    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch (err) {
      flash(`Socket create failed: ${err instanceof Error ? err.message : 'unknown'}`)
      return
    }

    const entry: ManagedConnection = { id: localId, clientId, ws, status: 'connecting', openedAt: Date.now() }

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data.toString())
        if (msg.type === 'connection.accepted') {
          updateConn(localId, { status: 'accepted', sessionId: msg.sessionId, nodeId: msg.nodeId })
        } else if (msg.type === 'connection.rejected') {
          updateConn(localId, { status: 'rejected', reason: msg.reason })
        }
      } catch { /* ignore */ }
    }
    ws.onclose = () => {
      const current = connectionsRef.current.find((c) => c.id === localId)
      if (current && current.status !== 'rejected') updateConn(localId, { status: 'closed' })
    }
    ws.onerror = () => updateConn(localId, { status: 'closed', reason: 'socket error' })

    setConnections((prev) => [...prev, entry])
  }

  const openMany = (count: number) => {
    for (let i = 0; i < count; i++) openOne()
    flash(`Fired ${count} concurrent attempts on ${orgId}`)
  }

  const closeOne = (id: string) => {
    const conn = connectionsRef.current.find((c) => c.id === id)
    if (conn) { try { conn.ws.close() } catch { /* noop */ } }
  }

  const closeAll = () => {
    connectionsRef.current.forEach((c) => { try { c.ws.close() } catch { /* noop */ } })
    flash('Closed all')
  }

  const clearTerminated = () => {
    setConnections((prev) => prev.filter((c) => c.status === 'connecting' || c.status === 'accepted'))
  }

  const setLimit = async () => {
    const value = parseInt(limitInput, 10)
    if (!Number.isFinite(value) || value <= 0) { flash('Limit must be positive'); return }
    try {
      const res = await fetch(`/api/organizations/${encodeURIComponent(orgId)}/limit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: value }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        flash(`Set limit failed: ${body.error || `HTTP ${res.status}`}`)
        return
      }
      flash(`${orgId} limit set to ${value}`)
    } catch (err) {
      flash(`Set limit failed: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  const runRaceScenario = async () => {
    setLimitInput('5')
    try {
      await fetch(`/api/organizations/${encodeURIComponent(orgId)}/limit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 5 }),
      })
    } catch {
      flash('Backend unreachable')
      return
    }
    openMany(20)
  }

  const accepted = connections.filter((c) => c.status === 'accepted').length
  const rejected = connections.filter((c) => c.status === 'rejected').length
  const inFlight = connections.filter((c) => c.status === 'connecting').length

  return (
    <div className="card playground">
      <div className="card-title">
        <span className="icon">🧪</span>Playground
        <span className="playground-summary">
          <span className="pill pill-accepted">✓ {accepted}</span>
          <span className="pill pill-rejected">✗ {rejected}</span>
          {inFlight > 0 && <span className="pill pill-flight">… {inFlight}</span>}
        </span>
        {notice && <span className="playground-notice">{notice}</span>}
      </div>

      <div className="playground-controls">
        <div className="control-row">
          <input
            value={orgId}
            onChange={(e) => setOrgId(e.target.value.trim())}
            placeholder="org id"
            title="Organization ID"
          />
          <input
            type="number"
            min={1}
            value={limitInput}
            onChange={(e) => setLimitInput(e.target.value)}
            title="Limit"
          />
          <button className="btn btn-primary" onClick={setLimit}>Set limit</button>
          <button className="btn" onClick={openOne}>+1</button>
          <button className="btn" onClick={() => openMany(5)}>+5</button>
          <button className="btn" onClick={() => openMany(20)}>+20</button>
          <button className="btn btn-warning" onClick={runRaceScenario} title="limit=5, fire 20 concurrent">🏁 Race</button>
          <button className="btn btn-drain-small" onClick={closeAll} disabled={connections.length === 0}>Disconnect all</button>
          <button className="btn" onClick={clearTerminated} disabled={connections.every((c) => c.status === 'connecting' || c.status === 'accepted')}>Clear</button>
        </div>
      </div>

      <div className="scroll-area playground-list">
        {connections.length === 0 ? (
          <div className="empty-state">Set a limit → click +1, +5, +20 or Race to see it react above.</div>
        ) : (
          connections.map((c) => (
            <div key={c.id} className={`conn-row conn-${c.status}`}>
              <span className="conn-client">{c.clientId}</span>
              <span className={`conn-status conn-${c.status}`}>{c.status}</span>
              {c.nodeId && <span className="conn-meta">on {c.nodeId}</span>}
              {c.sessionId && <span className="conn-meta conn-session">{c.sessionId.slice(0, 8)}…</span>}
              {c.reason && <span className="conn-meta conn-reason">{c.reason}</span>}
              {(c.status === 'accepted' || c.status === 'connecting') && (
                <button className="btn btn-mini" onClick={() => closeOne(c.id)}>×</button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
