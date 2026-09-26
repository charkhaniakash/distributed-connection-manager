import WebSocket from 'ws';
import { Server as HTTPServer, IncomingMessage } from 'http';
import { ConnectionService } from './connection-service';
import { SessionManager } from './session-manager';
import {
  WebSocketHandler,
  parseConnectionParams,
  sendConnectionAccepted,
  sendConnectionRejected,
} from './websocket-handler';
import { NodeState } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config/config';

/**
 * ConnectionManager manages the WebSocket server and coordinates connection acceptance
 * This is the entry point for all WebSocket connections
 */
export class ConnectionManager {
  private wss: WebSocket.Server | null = null;
  private activeConnections: Map<string, WebSocketHandler> = new Map();
  private currentNodeState: NodeState = NodeState.STARTING;

  constructor(
    private connectionService: ConnectionService,
    private sessionManager: SessionManager
  ) {}

  /**
   * Initialize WebSocket server
   */
  initialize(server: HTTPServer): void {
    this.wss = new WebSocket.Server({
      server,
      path: '/ws',
    });

    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      void this.handleConnection(ws, request);
    });

    logger.info('WebSocket server initialized', { path: '/ws' });
  }

  /**
   * Handle new WebSocket connection
   */
  private async handleConnection(ws: WebSocket, request: IncomingMessage): Promise<void> {
    try {
      // Parse connection parameters
      const { clientId, organizationId } = parseConnectionParams(request);

      if (!clientId || !organizationId) {
        logger.warn('Connection rejected - missing parameters');
        sendConnectionRejected(ws, 'INVALID_PARAMETERS');
        return;
      }

      // Attempt to accept connection
      const result = await this.connectionService.acceptConnection({
        clientId,
        organizationId,
        nodeState: this.currentNodeState,
      });

      if (!result.accepted || !result.session) {
        logger.warn('Connection rejected', {
          reason: result.reason,
          clientId,
          organizationId,
        });
        sendConnectionRejected(ws, result.reason!);
        return;
      }

      // Connection accepted - send confirmation
      const session = result.session;
      sendConnectionAccepted(ws, session.sessionId, config.nodeId);

      // Activate session
      await this.sessionManager.activateSession(session.sessionId);

      // Create WebSocket handler
      const handler = new WebSocketHandler(
        ws,
        session.sessionId,
        this.sessionManager,
        this.connectionService
      );
      handler.start();

      // Track active connection
      this.activeConnections.set(session.sessionId, handler);

      // Remove from tracking when closed
      ws.on('close', () => {
        this.activeConnections.delete(session.sessionId);
      });

      logger.info('Connection established', {
        sessionId: session.sessionId,
        clientId,
        organizationId,
      });
    } catch (error) {
      logger.error('Error handling connection', error as Error);
      sendConnectionRejected(ws, 'INVALID_PARAMETERS');
    }
  }

  /**
   * Update node state (used for draining)
   */
  setNodeState(state: NodeState): void {
    this.currentNodeState = state;
    logger.info('Node state updated', { state });
  }

  /**
   * Get current node state
   */
  getNodeState(): NodeState {
    return this.currentNodeState;
  }

  /**
   * Get active connection count
   */
  getActiveConnectionCount(): number {
    return this.activeConnections.size;
  }

  /**
   * Close all active connections
   */
  closeAllConnections(): void {
    logger.info('Closing all connections', { count: this.activeConnections.size });

    for (const [sessionId, handler] of this.activeConnections.entries()) {
      handler.close();
      this.activeConnections.delete(sessionId);
    }
  }

  /**
   * Shutdown WebSocket server
   */
  async shutdown(): Promise<void> {
    if (this.wss) {
      return new Promise((resolve, reject) => {
        this.wss!.close((error) => {
          if (error) {
            logger.error('Error closing WebSocket server', error);
            reject(error);
          } else {
            logger.info('WebSocket server closed');
            resolve();
          }
        });
      });
    }
  }
}
