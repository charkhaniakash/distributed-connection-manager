import { Node } from '../types'
import './NodesList.css'

interface Props {
  nodes: Node[]
  onDrain: (nodeId: string) => void
}

export default function NodesList({ nodes, onDrain }: Props) {
  if (!nodes || nodes.length === 0) {
    return (
      <div className="card full-width">
        <div className="card-title">
          <span className="icon">🖥️</span>
          Nodes Status
        </div>
        <div className="empty-state">No nodes found</div>
      </div>
    )
  }

  return (
    <div className="card full-width">
      <div className="card-title">
        <span className="icon">🖥️</span>
        Nodes Status
      </div>
      <div className="nodes-list">
        {nodes.map(node => {
          const statusClass = node.state.toLowerCase()
          const canDrain = node.state === 'ACTIVE'

          return (
            <div key={node.nodeId} className={`node-item ${statusClass}`}>
              <div className="node-header">
                <span className="node-id">{node.nodeId}</span>
                <span className={`node-status status-${statusClass}`}>{node.state}</span>
              </div>
              <div className="node-details">
                <div>💼 Active Sessions: <strong>{node.activeSessions || 0}</strong></div>
                <div>💓 Last Heartbeat: <strong>{node.isHealthy ? 'Healthy' : 'Unhealthy'}</strong></div>
                <div>🔌 Capacity: <strong>{node.capacity || 0}</strong></div>
              </div>
              <div className="actions">
                <button 
                  className="btn btn-drain" 
                  onClick={() => onDrain(node.nodeId)}
                  disabled={!canDrain}
                >
                  🚪 Drain Node
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
