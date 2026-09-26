export enum NodeState {
  STARTING = 'STARTING',
  ACTIVE = 'ACTIVE',
  DRAINING = 'DRAINING',
  STOPPED = 'STOPPED',
}

export interface NodeInfo {
  nodeId: string;
  state: NodeState;
  lastHeartbeat: number;
  port: number;
}

export interface NodeHealthStatus {
  nodeId: string;
  state: NodeState;
  isHealthy: boolean;
  lastHeartbeat: number;
  sessionCount: number;
}
