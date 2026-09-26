import { StatsResponse, Node, Organization } from '../types'
import './StatsCards.css'

interface Props {
  stats: StatsResponse
  nodes: Node[]
  organizations: Organization[]
}

export default function StatsCards({ stats, nodes, organizations }: Props) {
  const activeNodes = nodes.filter((n) => n.state === 'ACTIVE' && n.isAlive).length
  const totalNodes = nodes.length

  return (
    <>
      <div className="stat-card">
        <div>
          <div className="stat-label">
            <span className="icon">📊</span>Total connections
          </div>
          <div className="stat-sub">Active sessions</div>
        </div>
        <div className="stat-value">{stats.totalActiveSessions || 0}</div>
      </div>

      <div className="stat-card">
        <div>
          <div className="stat-label">
            <span className="icon">🖥️</span>Active nodes
          </div>
          <div className="stat-sub">Healthy / total</div>
        </div>
        <div className="stat-value">{activeNodes}<span style={{fontSize:14,color:'#888',fontWeight:600}}>/{totalNodes}</span></div>
      </div>

      <div className="stat-card">
        <div>
          <div className="stat-label">
            <span className="icon">🏢</span>Organizations
          </div>
          <div className="stat-sub">With active sessions</div>
        </div>
        <div className="stat-value">{organizations.length}</div>
      </div>
    </>
  )
}
