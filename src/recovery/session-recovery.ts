import { SessionManager } from '../connection/session-manager';
import { SessionRepository } from '../redis/session-repository';
import { SessionStatus } from '../types';
import { logger } from '../utils/logger';

/**
 * SessionRecoveryService handles cleanup of orphaned sessions
 * Ensures that sessions from crashed nodes are properly cleaned up
 */
export class SessionRecoveryService {
  constructor(
    private sessionRepository: SessionRepository,
    private sessionManager: SessionManager
  ) {}

  /**
   * Recover all sessions from a dead node
   * This is idempotent - safe to call multiple times for the same node
   */
  async recoverNodeSessions(nodeId: string): Promise<void> {
    try {
      const sessionIds = await this.sessionRepository.getNodeSessions(nodeId);

      logger.info('SESSION_RECOVERED - Starting recovery', {
        nodeId,
        sessionCount: sessionIds.length,
      });

      let recoveredCount = 0;

      for (const sessionId of sessionIds) {
        const recovered = await this.recoverSession(sessionId, nodeId);
        if (recovered) {
          recoveredCount++;
        }
      }

      logger.info('Recovery completed', {
        nodeId,
        totalSessions: sessionIds.length,
        recoveredCount,
      });
    } catch (error) {
      logger.error('Failed to recover node sessions', error, { nodeId });
      throw error;
    }
  }

  /**
   * Recover a single session
   * Returns true if session was recovered, false if already cleaned up
   */
  private async recoverSession(sessionId: string, nodeId: string): Promise<boolean> {
    try {
      const session = await this.sessionRepository.getSession(sessionId);

      if (!session) {
        // Session already cleaned up
        logger.debug('Session already cleaned up', { sessionId, nodeId });
        return false;
      }

      // Mark session as failed
      await this.sessionRepository.updateSessionStatus(sessionId, SessionStatus.NODE_FAILURE);

      // Clean up session atomically (includes capacity release)
      await this.sessionManager.cleanupSession(sessionId);

      logger.info('Session recovered', {
        sessionId,
        organizationId: session.organizationId,
        nodeId,
      });

      return true;
    } catch (error) {
      logger.error('Failed to recover session', error, { sessionId, nodeId });
      return false;
    }
  }

  /**
   * Recover sessions that have exceeded their timeout
   * Can be used as an additional safety mechanism
   */
  async recoverStaleSessions(nodeId: string, timeoutMs: number): Promise<void> {
    try {
      const sessionIds = await this.sessionRepository.getNodeSessions(nodeId);
      const now = Date.now();
      let recoveredCount = 0;

      for (const sessionId of sessionIds) {
        const session = await this.sessionRepository.getSession(sessionId);

        if (!session) {
          continue;
        }

        const age = now - session.lastHeartbeat;

        if (age > timeoutMs) {
          logger.warn('Stale session detected', {
            sessionId,
            ageMs: age,
            timeoutMs,
          });

          await this.recoverSession(sessionId, nodeId);
          recoveredCount++;
        }
      }

      if (recoveredCount > 0) {
        logger.info('Stale sessions recovered', {
          nodeId,
          count: recoveredCount,
        });
      }
    } catch (error) {
      logger.error('Failed to recover stale sessions', error, { nodeId });
    }
  }
}
