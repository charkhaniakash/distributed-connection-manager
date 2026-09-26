import { Session, SessionStatus, SessionCreateParams } from '../types';
import { SessionRepository } from '../redis/session-repository';
import { logger } from '../utils/logger';

/**
 * SessionManager handles session lifecycle operations
 * Coordinates between WebSocket connections and Redis session state
 */
export class SessionManager {
  constructor(private sessionRepository: SessionRepository) {}

  /**
   * Create a new session
   */
  async createSession(params: SessionCreateParams): Promise<Session> {
    const session = await this.sessionRepository.createSession(params);

    // Add session to organization and node tracking sets
    await this.sessionRepository.addSessionToOrganization(
      session.sessionId,
      session.organizationId
    );
    await this.sessionRepository.addSessionToNode(session.sessionId, session.nodeId);

    logger.info('SESSION_CREATED', {
      sessionId: session.sessionId,
      clientId: session.clientId,
      organizationId: session.organizationId,
      nodeId: session.nodeId,
    });

    return session;
  }

  /**
   * Activate a session (transition from STARTING to ACTIVE)
   */
  async activateSession(sessionId: string): Promise<void> {
    await this.sessionRepository.updateSessionStatus(sessionId, SessionStatus.ACTIVE);

    logger.info('SESSION_ACTIVATED', { sessionId });
  }

  /**
   * Update session heartbeat
   */
  async updateHeartbeat(sessionId: string): Promise<void> {
    await this.sessionRepository.updateSessionHeartbeat(sessionId);
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<Session | null> {
    return await this.sessionRepository.getSession(sessionId);
  }

  /**
   * Get all sessions for an organization
   */
  async getOrganizationSessions(organizationId: string): Promise<Session[]> {
    const sessionIds = await this.sessionRepository.getOrganizationSessions(organizationId);
    const sessions: Session[] = [];

    for (const sessionId of sessionIds) {
      const session = await this.sessionRepository.getSession(sessionId);
      if (session) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Get all sessions for a node
   */
  async getNodeSessions(nodeId: string): Promise<Session[]> {
    const sessionIds = await this.sessionRepository.getNodeSessions(nodeId);
    const sessions: Session[] = [];

    for (const sessionId of sessionIds) {
      const session = await this.sessionRepository.getSession(sessionId);
      if (session) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Get session count for a node
   */
  async getNodeSessionCount(nodeId: string): Promise<number> {
    return await this.sessionRepository.getNodeSessionCount(nodeId);
  }

  /**
   * Clean up a session
   * This is idempotent - safe to call multiple times
   */
  async cleanupSession(sessionId: string): Promise<void> {
    const session = await this.sessionRepository.getSession(sessionId);

    if (!session) {
      // Session already cleaned up
      logger.debug('Session already cleaned up', { sessionId });
      return;
    }

    // Remove from tracking sets
    await this.sessionRepository.removeSessionFromOrganization(
      sessionId,
      session.organizationId
    );
    await this.sessionRepository.removeSessionFromNode(sessionId, session.nodeId);

    // Delete session data
    await this.sessionRepository.deleteSession(sessionId);

    logger.info('SESSION_CLEANED_UP', {
      sessionId,
      organizationId: session.organizationId,
      nodeId: session.nodeId,
    });
  }
}
