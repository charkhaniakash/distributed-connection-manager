import { Request, Response } from 'express';
import { SessionManager } from '../../connection/session-manager';
import { logger } from '../../utils/logger';

/**
 * Sessions controller
 */
export class SessionsController {
  constructor(private sessionManager: SessionManager) {}

  /**
   * GET /sessions/:sessionId
   * Returns session details
   */
  async getSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const session = await this.sessionManager.getSession(sessionId);

      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      res.json({
        sessionId: session.sessionId,
        clientId: session.clientId,
        organizationId: session.organizationId,
        nodeId: session.nodeId,
        status: session.status,
        startedAt: session.startedAt,
        lastHeartbeat: session.lastHeartbeat,
      });
    } catch (error) {
      logger.error('Error getting session', error);
      res.status(500).json({
        error: 'Failed to retrieve session',
      });
    }
  }
}
