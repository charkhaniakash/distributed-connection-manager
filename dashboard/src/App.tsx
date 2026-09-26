import { useState, useEffect } from 'react'
import { StatsResponse, NodesResponse, Node, Organization } from './types'
import Header from './components/Header'
import StatsCards from './components/StatsCards'
import GlobalCapacity from './components/GlobalCapacity'
import NodesList from './components/NodesList'
import OrganizationsList from './components/OrganizationsList'
import Playground from './components/Playground'
import './App.css'

function App() {
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [nodes, setNodes] = useState<Node[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      const [statsRes, nodesRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/nodes'),
      ])

      if (!statsRes.ok || !nodesRes.ok) {
        throw new Error(`Backend returned ${statsRes.status} / ${nodesRes.status}`)
      }

      const statsData = (await statsRes.json()) as StatsResponse
      const nodesData = (await nodesRes.json()) as NodesResponse

      setStats(statsData)
      setNodes(nodesData.nodes ?? [])
      setOrganizations(
        Object.entries(statsData.organizations ?? {}).map(
          ([organizationId, { activeCount, limit }]) => ({
            organizationId,
            activeCount,
            limit,
          })
        )
      )
      setLastUpdate(new Date())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }

  const handleDrainNode = async (nodeId: string) => {
    if (!confirm(`Drain node ${nodeId}?`)) return

    try {
      const response = await fetch(`/api/nodes/${nodeId}/drain`, {
        method: 'POST',
      })

      if (response.ok) {
        await fetchData()
      } else {
        const body = await response.json().catch(() => ({}))
        alert(`Failed to drain node: ${body.error || `HTTP ${response.status}`}`)
      }
    } catch (err) {
      alert(
        `Failed to drain node: ${err instanceof Error ? err.message : 'Unknown error'}`
      )
    }
  }

  const handleActivateNode = async (nodeId: string) => {
    try {
      const response = await fetch(`/api/nodes/${nodeId}/activate`, {
        method: 'POST',
      })

      if (response.ok) {
        await fetchData()
      } else {
        const body = await response.json().catch(() => ({}))
        alert(`Failed to activate node: ${body.error || `HTTP ${response.status}`}`)
      }
    } catch (err) {
      alert(
        `Failed to activate node: ${err instanceof Error ? err.message : 'Unknown error'}`
      )
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 2000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Header lastUpdate={lastUpdate} error={error} />

      {stats && (
        <>
          <div className="stats-row">
            <StatsCards stats={stats} nodes={nodes} organizations={organizations} />
          </div>

          <GlobalCapacity stats={stats} />

          <div className="nodes-row">
            <NodesList nodes={nodes} onDrain={handleDrainNode} onActivate={handleActivateNode} />
          </div>

          <div className="bottom-row">
            <OrganizationsList organizations={organizations} />
            <Playground />
          </div>
        </>
      )}
    </div>
  )
}

export default App
