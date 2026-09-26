import { Stats, Node } from '../types'
import './StatsCards.css'

interface Props {
  stats: Stats
  nodes: Node[]
}

export default function StatsCards({ stats, nodes }: Props) {
  const activeNodes = nodes.filter(n => n.state === 'ACTIVE').length

  return (
    <div className="grid">
      <div className="card">
        <div className="card-title">
          <span className="icon">📊</span>
          Total Connections
        </div>
        <div className="stat-value">{stats.global.activeConnections || 0}</div>
        <div className="stat-label">Active Sessions</div>
      </div>

      <div className="card">
        <div className="card-title">
          <span className="icon">🖥️</span>
          Active Nodes
        </div>
        <div className="stat-value">{activeNodes}</div>
        <div className="stat-label">Healthy Nodes</div>
      </div>

      <div className="card">
        <div className="card-title">
          <span className="icon">🏢</span>
          Organizations
        </div>
        <div className="stat-value">{stats.organizations.length || 0}</div>
        <div className="stat-label">With Active Sessions</div>
      </div>
    </div>
  )
}
