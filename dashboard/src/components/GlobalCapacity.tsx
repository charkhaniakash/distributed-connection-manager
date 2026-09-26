import { StatsResponse } from '../types'
import './GlobalCapacity.css'

interface Props {
  stats: StatsResponse
}

export default function GlobalCapacity({ stats }: Props) {
  const used = stats.totalActiveSessions || 0
  const total = stats.globalCapacity || 1
  const percentage = Math.min(100, Math.round((used / total) * 100))

  let progressClass = ''
  if (percentage >= 90) progressClass = 'danger'
  else if (percentage >= 70) progressClass = 'warning'

  return (
    <div className="card capacity-card">
      <div className="capacity-header">
        <span className="capacity-title">
          <span className="icon">⚡</span> Global capacity
        </span>
        <span className="capacity-nums">
          <strong>{used}</strong> / {total} · {percentage}%
        </span>
      </div>
      <div className="progress-bar">
        <div
          className={`progress-fill ${progressClass}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
