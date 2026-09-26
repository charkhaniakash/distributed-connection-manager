import { Organization } from '../types'
import './OrganizationsList.css'

interface Props {
  organizations: Organization[]
}

export default function OrganizationsList({ organizations }: Props) {
  return (
    <div className="card orgs-card">
      <div className="card-title">
        <span className="icon">🏢</span>Organizations
      </div>
      <div className="scroll-area orgs-list">
        {organizations.length === 0 ? (
          <div className="empty-state">No orgs with active sessions</div>
        ) : (
          organizations.map((org) => {
            const percentage =
              org.limit > 0
                ? Math.min(100, Math.round((org.activeCount / org.limit) * 100))
                : 0
            let progressClass = ''
            if (percentage >= 90) progressClass = 'danger'
            else if (percentage >= 70) progressClass = 'warning'

            return (
              <div key={org.organizationId} className="org-item">
                <div className="org-row">
                  <span className="org-name">{org.organizationId}</span>
                  <span className="org-usage">
                    {org.activeCount}/{org.limit} · {percentage}%
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
          })
        )}
      </div>
    </div>
  )
}
