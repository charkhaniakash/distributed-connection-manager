import { Request, Response } from 'express';
import { SessionManager } from '../../connection/session-manager';
import { logger } from '../../utils/logger';
import { CapacityRepository } from '../../redis';

/**
 * Organizations controller
 */
export class OrganizationsController {
  constructor(
    private sessionManager: SessionManager,
    private capacityRepository: CapacityRepository
  ) {}

  /**
   * GET /organizations/:organizationId
   * Returns organization capacity and active sessions
   */
  async getOrganization(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;

      const limit = await this.capacityRepository.getOrganizationLimit(organizationId);
      const activeCount = await this.capacityRepository.getOrganizationActiveCount(organizationId);
      const sessions = await this.sessionManager.getOrganizationSessions(organizationId);

      res.json({
        organizationId,
        limit,
        activeCount,
        availableCapacity: Math.max(0, limit - activeCount),
        sessions: sessions.map((s) => ({
          sessionId: s.sessionId,
          clientId: s.clientId,
          nodeId: s.nodeId,
          status: s.status,
          startedAt: s.startedAt,
        })),
      });
    } catch (error) {
      logger.error('Error getting organization', error);
      res.status(500).json({
        error: 'Failed to retrieve organization',
      });
    }
  }

  /**
   * PUT /organizations/:organizationId/limit
   * Set organization connection limit
   */
  async setOrganizationLimit(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { limit } = req.body as { limit: number };

      if (!limit || typeof limit !== 'number' || limit <= 0) {
        res.status(400).json({
          error: 'Invalid limit value',
        });
        return;
      }

      await this.capacityRepository.setOrganizationLimit(organizationId, limit);

      res.json({
        organizationId,
        limit,
        message: 'Limit updated successfully',
      });
    } catch (error) {
      logger.error('Error setting organization limit', error);
      res.status(500).json({
        error: 'Failed to set organization limit',
      });
    }
  }
}
