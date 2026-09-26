import { Node } from '../types'
import './NodesList.css'

interface Props {
  nodes: Node[]
  onDrain: (nodeId: string) => void
  onActivate: (nodeId: string) => void
}

function formatHeartbeat(timestamp: number): string {
  if (!timestamp) return 'never'
  const secondsAgo = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (secondsAgo < 60) return `${secondsAgo}s ago`
  return `${Math.floor(secondsAgo / 60)}m ago`
}

export default function NodesList({ nodes, onDrain, onActivate }: Props) {
  if (!nodes || nodes.length === 0) {
    return <div className="empty-state">No nodes found</div>
  }

  return (
    <div className="nodes-list">
      {nodes.map((node) => {
        const statusClass = node.state.toLowerCase()
        const canDrain = node.state === 'ACTIVE' && node.isAlive
        const canActivate =
          (node.state === 'STOPPED' || node.state === 'DRAINING') && node.isAlive

        return (
          <div key={node.nodeId} className={`node-item ${statusClass}`}>
            <div className="node-header">
              <span className="node-id">{node.nodeId}</span>
              <span className={`node-status status-${statusClass}`}>
                {node.state}
              </span>
            </div>
            <div className="node-details">
              <div>💼 Sessions: <strong>{node.sessionCount}</strong></div>
              <div>🔌 Port: <strong>{node.port}</strong></div>
              <div>💓 Heartbeat: <strong>{node.isAlive ? formatHeartbeat(node.lastHeartbeat) : 'stale'}</strong></div>
              <div>🟢 Alive: <strong>{node.isAlive ? 'yes' : 'no'}</strong></div>
            </div>
            <div className="actions">
              {canActivate ? (
                <button
                  className="btn-activate"
                  onClick={() => onActivate(node.nodeId)}
                >
                  ▶ Activate
                </button>
              ) : (
                <button
                  className="btn-drain"
                  onClick={() => onDrain(node.nodeId)}
                  disabled={!canDrain}
                >
                  🚪 Drain
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
