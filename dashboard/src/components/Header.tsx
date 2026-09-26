import './Header.css'

interface Props {
  lastUpdate: Date
  error: string | null
}

export default function Header({ lastUpdate, error }: Props) {
  return (
    <header className="header">
      <div className="header-left">
        <h1>🌐 Connection Manager</h1>
        <span className="subtitle">Distributed WebSocket coordination</span>
      </div>
      <div className="header-right">
        {error ? (
          <span className="header-status error">⚠ {error}</span>
        ) : (
          <span className="header-status ok">
            <span className="dot" /> live · updated {lastUpdate.toLocaleTimeString()}
          </span>
        )}
      </div>
    </header>
  )
}
