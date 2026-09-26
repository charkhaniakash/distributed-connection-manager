/**
 * Types that mirror the backend REST responses.
 * Backend controllers live under src/api/controllers/*.ts
 */

export type NodeState = 'STARTING' | 'ACTIVE' | 'DRAINING' | 'STOPPED'

/** Shape returned by GET /nodes — nodes[] entries */
export interface Node {
  nodeId: string
  state: NodeState
  port: number
  isAlive: boolean
  lastHeartbeat: number
  sessionCount: number
}

/** Shape returned by GET /nodes */
export interface NodesResponse {
  nodes: Node[]
  totalNodes: number
}

/** Shape returned by GET /stats — organizations is a keyed object */
export interface StatsResponse {
  totalActiveSessions: number
  globalCapacity: number
  availableCapacity: number
  nodeCount: number
  nodes: Array<{ nodeId: string; state: NodeState }>
  organizationCount: number
  organizations: Record<string, { activeCount: number; limit: number }>
}

/** UI-friendly organization row derived from StatsResponse.organizations */
export interface Organization {
  organizationId: string
  activeCount: number
  limit: number
}
