import { useState, useEffect } from 'react'
import { Stats, Node } from './types'
import Header from './components/Header'
import StatsCards from './components/StatsCards'
import GlobalCapacity from './components/GlobalCapacity'
import NodesList from './components/NodesList'
import OrganizationsList from './components/OrganizationsList'
import './App.css'

function App() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [nodes, setNodes] = useState<Node[]>([])
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    try {
      const [statsRes, nodesRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/nodes'),
      ])

      if (statsRes.ok && nodesRes.ok) {
        const statsData = await statsRes.json()
        const nodesData = await nodesRes.json()
        
        setStats(statsData)
        setNodes(nodesData)
        setLastUpdate(new Date())
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDrainNode = async (nodeId: string) => {
    if (!confirm(`Are you sure you want to drain node ${nodeId}?`)) {
      return
    }

    try {
      const response = await fetch(`/api/nodes/${nodeId}/drain`, {
        method: 'POST',
      })

      if (response.ok) {
        alert(`Node ${nodeId} is now draining`)
        await fetchData()
      } else {
        const error = await response.json()
        alert(`Failed to drain node: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      alert(`Failed to drain node: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
    <>
      <Header />
      
      {stats && (
        <>
          <StatsCards stats={stats} nodes={nodes} />
          <GlobalCapacity stats={stats} />
          <NodesList nodes={nodes} onDrain={handleDrainNode} />
          <OrganizationsList organizations={stats.organizations} />
        </>
      )}

      <div className="last-update">
        Last updated: {lastUpdate.toLocaleTimeString()}
      </div>
    </>
  )
}

export default App
