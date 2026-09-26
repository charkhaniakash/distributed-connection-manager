import { CapacityManager } from '../capacity/capacity-manager';
import { SessionManager } from './session-manager';
import {
  Session,
  ConnectionRejectionReason,
  CapacityReservationResult,
} from '../types';
import { NodeState } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config/config';

export interface ConnectionRequest {
  clientId: string;
  organizationId: string;
  nodeState: NodeState;
}

export interface ConnectionResult {
  accepted: boolean;
  session?: Session;
  reason?: ConnectionRejectionReason;
}

/**
 * ConnectionService orchestrates the connection acceptance flow
 * Coordinates capacity checking, session creation, and business logic
 */
export class ConnectionService {
  constructor(
    private capacityManager: CapacityManager,
    private sessionManager: SessionManager
  ) {}

  /**
   * Attempt to accept a new connection
   * 
   * This method orchestrates the full connection acceptance flow:
   * 1. Check if node is accepting connections
   * 2. Validate request parameters
   * 3. Atomically reserve capacity
   * 4. Create session if capacity is available
   * 5. Release capacity if session creation fails
   */
  async acceptConnection(request: ConnectionRequest): Promise<ConnectionResult> {
    const { clientId, organizationId, nodeState } = request;

    // Check if node is in draining state
    if (nodeState === NodeState.DRAINING || nodeState === NodeState.STOPPED) {
      logger.warn('Connection rejected - node not accepting connections', {
        nodeId: config.nodeId,
        nodeState,
        organizationId,
      });

      return {
        accepted: false,
        reason: ConnectionRejectionReason.NODE_DRAINING,
      };
    }

    // Validate parameters
    if (!clientId || !organizationId) {
      logger.warn('Connection rejected - invalid parameters', { clientId, organizationId });
      return {
        accepted: false,
        reason: ConnectionRejectionReason.INVALID_PARAMETERS,
      };
    }

    // Attempt to reserve capacity atomically
    let session: Session | null = null;
    const reservation = await this.capacityManager.reserveCapacity(
      organizationId,
      config.defaultOrgLimit,
      config.globalCapacity
    );

    if (reservation.result === CapacityReservationResult.ORGANIZATION_LIMIT_REACHED) {
      logger.warn('Connection rejected - organization limit reached', {
        organizationId,
        count: reservation.organizationCount,
      });

      return {
        accepted: false,
        reason: ConnectionRejectionReason.ORGANIZATION_CONNECTION_LIMIT_REACHED,
      };
    }

    if (reservation.result === CapacityReservationResult.GLOBAL_CAPACITY_REACHED) {
      logger.warn('Connection rejected - global capacity reached', {
        count: reservation.globalCount,
      });

      return {
        accepted: false,
        reason: ConnectionRejectionReason.GLOBAL_CONNECTION_CAPACITY_REACHED,
      };
    }

    // Capacity reserved successfully - create session
    try {
      session = await this.sessionManager.createSession({
        clientId,
        organizationId,
        nodeId: config.nodeId,
      });

      logger.info('CONNECTION_ACCEPTED', {
        sessionId: session.sessionId,
        clientId,
        organizationId,
        nodeId: config.nodeId,
        orgCount: reservation.organizationCount,
        globalCount: reservation.globalCount,
      });

      return {
        accepted: true,
        session,
      };
    } catch (error) {
      // Session creation failed - release the reserved capacity
      logger.error('Session creation failed, releasing capacity', error, {
        organizationId,
        clientId,
      });

      await this.capacityManager.releaseCapacity(organizationId);

      return {
        accepted: false,
        reason: ConnectionRejectionReason.INVALID_PARAMETERS,
      };
    }
  }

  /**
   * Handle connection disconnect
   * Performs idempotent cleanup of session and capacity
   */
  async handleDisconnect(sessionId: string): Promise<void> {
    const session = await this.sessionManager.getSession(sessionId);

    if (!session) {
      logger.debug('Session not found during disconnect', { sessionId });
      return;
    }

    // Clean up session
    await this.sessionManager.cleanupSession(sessionId);

    // Release capacity
    await this.capacityManager.releaseCapacity(session.organizationId);

    logger.info('CONNECTION_DISCONNECTED', {
      sessionId,
      organizationId: session.organizationId,
      nodeId: session.nodeId,
    });
  }
}
