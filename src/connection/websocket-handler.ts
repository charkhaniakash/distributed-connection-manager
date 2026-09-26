import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { ConnectionService } from './connection-service';
import { SessionManager } from './session-manager';
import {
  ConnectionAcceptedMessage,
  ConnectionRejectedMessage,
  HeartbeatMessage,
  WebSocketMessage,
} from '../types';
import { logger } from '../utils/logger';
import { config } from '../config/config';

/**
 * WebSocketHandler manages individual WebSocket connections
 * Handles protocol-level concerns like messages, heartbeats, and connection lifecycle
 */
export class WebSocketHandler {
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastPongReceived: number = Date.now();
  private missedPongs = 0;

  constructor(
    private ws: WebSocket,
    private sessionId: string,
    private sessionManager: SessionManager,
    private connectionService: ConnectionService
  ) {}

  /**
   * Start handling the WebSocket connection
   */
  start(): void {
    this.setupEventHandlers();
    this.startHeartbeat();
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers(): void {
    this.ws.on('message', (data: WebSocket.Data) => {
      this.handleMessage(data);
    });

    this.ws.on('close', () => {
      this.handleClose();
    });

    this.ws.on('error', (error: Error) => {
      this.handleError(error);
    });

    this.ws.on('pong', () => {
      // Update session heartbeat on pong response
      this.lastPongReceived = Date.now();
      this.missedPongs = 0;
      this.sessionManager.updateHeartbeat(this.sessionId).catch((error) => {
        logger.error('Failed to update heartbeat', error, { sessionId: this.sessionId });
      });
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(String(data)) as WebSocketMessage;

      if (message.type === 'heartbeat') {
        // Update heartbeat timestamp
        this.sessionManager.updateHeartbeat(this.sessionId).catch((error) => {
          logger.error('Failed to update heartbeat', error, { sessionId: this.sessionId });
        });
      }

      // Log received message
      logger.debug('Message received', { sessionId: this.sessionId, type: message.type });
    } catch (error) {
      logger.warn('Invalid message format', { sessionId: this.sessionId });
    }
  }

  /**
   * Handle WebSocket close event
   */
  private handleClose(): void {
    this.cleanup();
    this.connectionService.handleDisconnect(this.sessionId).catch((error) => {
      logger.error('Failed to handle disconnect', error, { sessionId: this.sessionId });
    });
  }

  /**
   * Handle WebSocket error event
   */
  private handleError(error: Error): void {
    logger.error('WebSocket error', error, { sessionId: this.sessionId });
  }

  /**
   * Start periodic heartbeat (ping/pong)
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        // Check if we've received pong since last ping
        const timeSinceLastPong = Date.now() - this.lastPongReceived;
        
        if (timeSinceLastPong > config.sessionHeartbeatIntervalMs * 2) {
          this.missedPongs++;
          
          // If we've missed 2 consecutive pongs, consider connection dead
          if (this.missedPongs >= 2) {
            logger.warn('Dead peer detected - no pong received', {
              sessionId: this.sessionId,
              missedPongs: this.missedPongs,
            });
            this.ws.terminate();
            return;
          }
        }
        
        this.ws.ping();
      }
    }, config.sessionHeartbeatIntervalMs);
  }

  /**
   * Send a message to the client
   */
  sendMessage(message: WebSocketMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send heartbeat message to client
   */
  sendHeartbeat(): void {
    const message: HeartbeatMessage = {
      type: 'heartbeat',
      timestamp: Date.now(),
    };
    this.sendMessage(message);
  }

  /**
   * Close the WebSocket connection
   */
  close(): void {
    this.cleanup();
    this.ws.close();
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

/**
 * Parse WebSocket connection query parameters
 */
export function parseConnectionParams(request: IncomingMessage): {
  clientId: string | null;
  organizationId: string | null;
} {
  const url = new URL(request.url || '', `http://${request.headers.host}`);
  const clientId = url.searchParams.get('clientId');
  const organizationId = url.searchParams.get('organizationId');

  return { clientId, organizationId };
}

/**
 * Send connection accepted message
 */
export function sendConnectionAccepted(ws: WebSocket, sessionId: string, nodeId: string): void {
  const message: ConnectionAcceptedMessage = {
    type: 'connection.accepted',
    sessionId,
    nodeId,
  };

  ws.send(JSON.stringify(message));
}

/**
 * Send connection rejected message and close connection
 */
export function sendConnectionRejected(ws: WebSocket, reason: string): void {
  const message: ConnectionRejectedMessage = {
    type: 'connection.rejected',
    reason: reason as ConnectionRejectedMessage['reason'],
  };

  ws.send(JSON.stringify(message), () => {
    ws.close();
  });
}
