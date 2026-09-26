export enum ConnectionRejectionReason {
  ORGANIZATION_CONNECTION_LIMIT_REACHED = 'ORGANIZATION_CONNECTION_LIMIT_REACHED',
  GLOBAL_CONNECTION_CAPACITY_REACHED = 'GLOBAL_CONNECTION_CAPACITY_REACHED',
  NODE_DRAINING = 'NODE_DRAINING',
  INVALID_PARAMETERS = 'INVALID_PARAMETERS',
}

export interface ConnectionAcceptedMessage {
  type: 'connection.accepted';
  sessionId: string;
  nodeId: string;
}

export interface ConnectionRejectedMessage {
  type: 'connection.rejected';
  reason: ConnectionRejectionReason;
}

export interface HeartbeatMessage {
  type: 'heartbeat';
  timestamp: number;
}

export type WebSocketMessage = ConnectionAcceptedMessage | ConnectionRejectedMessage | HeartbeatMessage;
