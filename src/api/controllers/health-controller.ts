import { Request, Response } from 'express';
import { NodeManager } from '../../node/node-manager';
import { redisClient } from '../../redis/redis-client';
import { config } from '../../config/config';

/**
 * Health check controller
 */
export class HealthController {
  constructor(private nodeManager: NodeManager) {}

  /**
   * GET /health
   * Returns health status of current node
   */
  async getHealth(req: Request, res: Response): Promise<void> {
    try {
      const redisHealthy = await redisClient.ping();
      const nodeState = this.nodeManager.getCurrentState();

      res.json({
        status: 'ok',
        nodeId: config.nodeId,
        state: nodeState,
        redis: redisHealthy ? 'connected' : 'disconnected',
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(503).json({
        status: 'error',
        nodeId: config.nodeId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
