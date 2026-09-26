/**
 * Centralized Redis key management
 * All Redis keys are constructed through these functions to ensure consistency
 */

export const RedisKeys = {
  // Session keys
  session: (sessionId: string): string => `session:${sessionId}`,

  // Organization keys
  orgSessions: (organizationId: string): string => `org:${organizationId}:sessions`,
  orgLimit: (organizationId: string): string => `org:${organizationId}:limit`,
  orgActiveCount: (organizationId: string): string => `org:${organizationId}:active_count`,

  // Node keys
  nodeSessions: (nodeId: string): string => `node:${nodeId}:sessions`,
  nodeState: (nodeId: string): string => `node:${nodeId}:state`,
  nodeHeartbeat: (nodeId: string): string => `node:${nodeId}:heartbeat`,
  nodeInfo: (nodeId: string): string => `node:${nodeId}:info`,

  // Global keys
  globalActiveCount: (): string => 'global:active_count',
  globalCapacity: (): string => 'global:capacity',
  allNodes: (): string => 'nodes:all',
};
