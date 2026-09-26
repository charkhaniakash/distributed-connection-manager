import { Stats } from '../types'
import './GlobalCapacity.css'

interface Props {
  stats: Stats
}

export default function GlobalCapacity({ stats }: Props) {
  const used = stats.global.activeConnections || 0
  const total = stats.global.globalCapacity || 1000
  const percentage = Math.round((used / total) * 100)

  let progressClass = ''
  if (percentage >= 90) {
    progressClass = 'danger'
  } else if (percentage >= 70) {
    progressClass = 'warning'
  }

  return (
    <div className="card capacity-card">
      <div className="card-title">
        <span className="icon">⚡</span>
        Global Capacity
        <span className="refresh-indicator"></span>
      </div>
      <div className="capacity-stats">
        <span className="capacity-value">{used} / {total}</span>
        <span className="capacity-percentage">{percentage}%</span>
      </div>
      <div className="progress-bar">
        <div className={`progress-fill ${progressClass}`} style={{ width: `${percentage}%` }}></div>
      </div>
    </div>
  )
}
