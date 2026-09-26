import { NodeManager } from './node-manager';
import { ConnectionManager } from '../connection/connection-manager';
import { NodeState } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config/config';

/**
 * DrainService handles graceful node shutdown
 * Stops accepting new connections and waits for existing connections to finish
 */
export class DrainService {
  private drainStartTime: number | null = null;
  private monitorInterval: NodeJS.Timeout | null = null;
  private hardTimeout: NodeJS.Timeout | null = null;
  private isDraining = false;

  constructor(
    private nodeManager: NodeManager,
    private connectionManager: ConnectionManager
  ) {}

  /**
   * Start draining the node
   * Idempotent - if already draining, return immediately
   */
  async startDrain(): Promise<void> {
    if (this.isDraining) {
      logger.warn('Node is already draining', { nodeId: config.nodeId });
      return;
    }

    this.isDraining = true;
    this.drainStartTime = Date.now();

    const activeConnections = this.connectionManager.getActiveConnectionCount();

    logger.info('NODE_DRAINING', {
      nodeId: config.nodeId,
      activeConnections,
      drainTimeoutMs: config.drainTimeoutMs,
    });

    // Update node state to DRAINING
    await this.nodeManager.updateNodeState(NodeState.DRAINING);

    // Update connection manager state so new connections are rejected
    this.connectionManager.setNodeState(NodeState.DRAINING);

    // Start monitoring for completion
    this.startMonitoring();

    // Set hard timeout
    this.hardTimeout = setTimeout(() => {
      this.forceComplete();
    }, config.drainTimeoutMs);
  }

  /**
   * Monitor active connections and complete drain when all are closed
   */
  private startMonitoring(): void {
    this.monitorInterval = setInterval(() => {
      const activeCount = this.connectionManager.getActiveConnectionCount();

      if (activeCount === 0) {
        logger.info('All connections closed naturally', { nodeId: config.nodeId });
        this.completeDrain();
      } else {
        const elapsed = Date.now() - (this.drainStartTime || 0);
        logger.debug('Waiting for connections to close', {
          nodeId: config.nodeId,
          remainingConnections: activeCount,
          elapsedMs: elapsed,
        });
      }
    }, 1000);
  }

  /**
   * Force completion by closing remaining connections
   */
  private forceComplete(): void {
    const activeCount = this.connectionManager.getActiveConnectionCount();

    if (activeCount > 0) {
      logger.warn('Drain timeout expired, forcing connection closure', {
        nodeId: config.nodeId,
        remainingConnections: activeCount,
      });

      this.connectionManager.closeAllConnections();
    }

    this.completeDrain();
  }

  /**
   * Complete the drain process
   */
  private completeDrain(): void {
    // Clear timers
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    if (this.hardTimeout) {
      clearTimeout(this.hardTimeout);
      this.hardTimeout = null;
    }

    // Update state
    this.nodeManager.updateNodeState(NodeState.STOPPED).catch((error) => {
      logger.error('Failed to update node state to STOPPED', error);
    });

    this.connectionManager.setNodeState(NodeState.STOPPED);

    const elapsedMs = Date.now() - (this.drainStartTime || 0);

    logger.info('Drain completed', {
      nodeId: config.nodeId,
      elapsedMs,
      finalState: NodeState.STOPPED,
    });

    this.isDraining = false;
    this.drainStartTime = null;
  }

  /**
   * Get drain status
   */
  getDrainStatus(): {
    isDraining: boolean;
    remainingConnections: number;
    elapsedMs: number;
  } {
    return {
      isDraining: this.isDraining,
      remainingConnections: this.connectionManager.getActiveConnectionCount(),
      elapsedMs: this.drainStartTime ? Date.now() - this.drainStartTime : 0,
    };
  }

  /**
   * Reset drain state so the node can be re-activated after a drain.
   * Clears any pending timers and marks the service as no longer draining.
   */
  reset(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    if (this.hardTimeout) {
      clearTimeout(this.hardTimeout);
      this.hardTimeout = null;
    }
    this.isDraining = false;
    this.drainStartTime = null;
  }
}
