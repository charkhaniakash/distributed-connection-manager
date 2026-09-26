import { NodeRepository } from '../redis/node-repository';
import { SessionRecoveryService } from './session-recovery';
import { logger } from '../utils/logger';
import { config } from '../config/config';

/**
 * FailureDetector monitors node health and triggers recovery when nodes fail
 * Runs periodically to detect dead nodes and initiate session cleanup
 */
export class FailureDetector {
  private detectionInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private nodeRepository: NodeRepository,
    private recoveryService: SessionRecoveryService
  ) {}

  /**
   * Start failure detection
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Failure detector already running');
      return;
    }

    this.isRunning = true;

    // Run detection periodically
    this.detectionInterval = setInterval(() => {
      void this.detectAndRecover();
    }, config.nodeFailureTimeoutMs);

    logger.info('Failure detector started', {
      checkIntervalMs: config.nodeFailureTimeoutMs,
    });
  }

  /**
   * Stop failure detection
   */
  stop(): void {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }

    this.isRunning = false;

    logger.info('Failure detector stopped');
  }

  /**
   * Detect dead nodes and trigger recovery
   */
  private async detectAndRecover(): Promise<void> {
    try {
      const deadNodes = await this.nodeRepository.findDeadNodes();

      if (deadNodes.length > 0) {
        logger.warn('NODE_FAILED - Dead nodes detected', {
          deadNodes,
          count: deadNodes.length,
        });

        // Trigger recovery for each dead node
        for (const nodeId of deadNodes) {
          await this.recoverNode(nodeId);
        }
      }
    } catch (error) {
      logger.error('Error in failure detection', error);
    }
  }

  /**
   * Recover sessions from a dead node
   */
  private async recoverNode(nodeId: string): Promise<void> {
    try {
      logger.info('Starting recovery for dead node', { nodeId });

      await this.recoveryService.recoverNodeSessions(nodeId);

      logger.info('Recovery completed for node', { nodeId });
    } catch (error) {
      logger.error('Failed to recover node', error, { nodeId });
    }
  }

  /**
   * Check if detector is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}
