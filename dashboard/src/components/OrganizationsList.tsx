import { Organization } from '../types'
import './OrganizationsList.css'

interface Props {
  organizations: Organization[]
}

export default function OrganizationsList({ organizations }: Props) {
  if (!organizations || organizations.length === 0) {
    return (
      <div className="card full-width">
        <div className="card-title">
          <span className="icon">🏢</span>
          Organizations
        </div>
        <div className="empty-state">No organizations with active sessions</div>
      </div>
    )
  }

  return (
    <div className="card full-width">
      <div className="card-title">
        <span className="icon">🏢</span>
        Organizations
      </div>
      <div className="orgs-list">
        {organizations.map(org => {
          const percentage = org.limit > 0 ? Math.round((org.count / org.limit) * 100) : 0
          let progressClass = ''
          
          if (percentage >= 90) {
            progressClass = 'danger'
          } else if (percentage >= 70) {
            progressClass = 'warning'
          }

          return (
            <div key={org.organizationId} className="org-item">
              <div className="org-content">
                <div className="org-name">{org.organizationId}</div>
                <div className="org-usage">
                  {org.count} / {org.limit} connections ({percentage}%)
                </div>
                <div className="progress-bar">
                  <div className={`progress-fill ${progressClass}`} style={{ width: `${percentage}%` }}></div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
