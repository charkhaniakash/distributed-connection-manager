import { Request, Response } from 'express';
import { CapacityRepository } from '../../redis/capacity-repository';
import { NodeManager } from '../../node/node-manager';
import { logger } from '../../utils/logger';

/**
 * Stats controller
 */
export class StatsController {
  constructor(
    private capacityRepository: CapacityRepository,
    private nodeManager: NodeManager
  ) {}

  /**
   * GET /stats
   * Returns global system statistics
   */
  async getStats(_req: Request, res: Response): Promise<void> {
    try {
      const globalActiveCount = await this.capacityRepository.getGlobalActiveCount();
      const globalCapacity = await this.capacityRepository.getGlobalCapacity();
      const nodes = await this.nodeManager.getAllNodes();

      // Get organizations with active connections
      const orgIds = await this.capacityRepository.getAllOrganizationIds();
      const organizations: Record<string, { activeCount: number; limit: number }> = {};

      for (const orgId of orgIds) {
        const activeCount = await this.capacityRepository.getOrganizationActiveCount(orgId);
        const limit = await this.capacityRepository.getOrganizationLimit(orgId);
        organizations[orgId] = { activeCount, limit };
      }

      res.json({
        totalActiveSessions: globalActiveCount,
        globalCapacity,
        availableCapacity: Math.max(0, globalCapacity - globalActiveCount),
        nodeCount: nodes.length,
        nodes: nodes.map((n) => ({
          nodeId: n.nodeId,
          state: n.state,
        })),
        organizationCount: orgIds.length,
        organizations,
      });
    } catch (error) {
      logger.error('Error getting stats', error);
      res.status(500).json({
        error: 'Failed to retrieve stats',
      });
    }
  }
}
