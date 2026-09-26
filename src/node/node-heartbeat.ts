import { NodeRepository } from '../redis/node-repository';
import { logger } from '../utils/logger';
import { config } from '../config/config';

/**
 * NodeHeartbeat manages periodic heartbeat updates to Redis
 * This allows other nodes to detect when this node has failed
 */
export class NodeHeartbeat {
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(private nodeRepository: NodeRepository) {}

  /**
   * Start sending periodic heartbeats
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Heartbeat already running');
      return;
    }

    this.isRunning = true;

    // Send initial heartbeat immediately
    this.sendHeartbeat();

    // Schedule periodic heartbeats
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, config.heartbeatIntervalMs);

    logger.info('NODE_HEARTBEAT started', {
      nodeId: config.nodeId,
      intervalMs: config.heartbeatIntervalMs,
    });
  }

  /**
   * Stop sending heartbeats
   */
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    this.isRunning = false;

    logger.info('Heartbeat stopped', { nodeId: config.nodeId });
  }

  /**
   * Send a single heartbeat
   */
  private async sendHeartbeat(): Promise<void> {
    try {
      await this.nodeRepository.updateNodeHeartbeat(config.nodeId);

      logger.debug('Heartbeat sent', {
        nodeId: config.nodeId,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to send heartbeat', error, { nodeId: config.nodeId });
    }
  }

  /**
   * Check if heartbeat is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}
