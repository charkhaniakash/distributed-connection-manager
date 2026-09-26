export enum SessionStatus {
  STARTING = 'STARTING',
  ACTIVE = 'ACTIVE',
  DISCONNECTED = 'DISCONNECTED',
  NODE_FAILURE = 'NODE_FAILURE',
  DRAINING = 'DRAINING',
}

export interface Session {
  sessionId: string;
  clientId: string;
  organizationId: string;
  nodeId: string;
  startedAt: number;
  lastHeartbeat: number;
  status: SessionStatus;
}

export interface SessionCreateParams {
  clientId: string;
  organizationId: string;
  nodeId: string;
}
