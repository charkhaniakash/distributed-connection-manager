import { Request, Response } from 'express';
import { NodeManager } from '../../node/node-manager';
import { config } from '../../config/config';
import { redisClient } from '../../redis';

/**
 * Health check controller
 */
export class HealthController {
  constructor(private nodeManager: NodeManager) {}

  /**
   * GET /health
   * Returns health status of current node
   */
  async getHealth(_req: Request, res: Response): Promise<void> {
    try {
      const redisHealthy = await this.ping();
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

  private async ping(): Promise<boolean> {
    try {
      await redisClient.getClient().ping();
      return true;
    } catch (error) {
      return false;
    }
  }
}
