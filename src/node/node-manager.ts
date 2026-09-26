import { NodeRepository } from '../redis/node-repository';
import { SessionRepository } from '../redis/session-repository';
import { NodeInfo, NodeState, NodeHealthStatus } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config/config';

/**
 * NodeManager handles node lifecycle, state transitions, and health status
 * Manages the current node and provides information about all nodes in the cluster
 */
export class NodeManager {
  private currentState: NodeState = NodeState.STARTING;

  constructor(
    private nodeRepository: NodeRepository,
    private sessionRepository: SessionRepository
  ) {}

  /**
   * Register the current node
   */
  async registerNode(): Promise<void> {
    const nodeInfo: NodeInfo = {
      nodeId: config.nodeId,
      state: NodeState.STARTING,
      lastHeartbeat: Date.now(),
      port: config.port,
    };

    await this.nodeRepository.registerNode(nodeInfo);
    this.currentState = NodeState.STARTING;

    logger.info('NODE_STARTED', { nodeId: config.nodeId, port: config.port });
  }

  /**
   * Transition node to ACTIVE state
   */
  async activateNode(): Promise<void> {
    await this.nodeRepository.updateNodeState(config.nodeId, NodeState.ACTIVE);
    this.currentState = NodeState.ACTIVE;

    logger.info('Node activated', { nodeId: config.nodeId });
  }

  /**
   * Get current node state
   */
  getCurrentState(): NodeState {
    return this.currentState;
  }

  /**
   * Update node state
   */
  async updateNodeState(state: NodeState): Promise<void> {
    await this.nodeRepository.updateNodeState(config.nodeId, state);
    this.currentState = state;

    logger.info('Node state changed', { nodeId: config.nodeId, state });
  }

  /**
   * Get node information
   */
  async getNodeInfo(nodeId: string): Promise<NodeInfo | null> {
    return await this.nodeRepository.getNodeInfo(nodeId);
  }

  /**
   * Get all nodes in the cluster
   */
  async getAllNodes(): Promise<NodeInfo[]> {
    return await this.nodeRepository.getAllNodes();
  }

  /**
   * Get health status for a specific node
   */
  async getNodeHealthStatus(nodeId: string): Promise<NodeHealthStatus | null> {
    const nodeInfo = await this.nodeRepository.getNodeInfo(nodeId);
    if (!nodeInfo) {
      return null;
    }

    const isAlive = await this.nodeRepository.isNodeAlive(nodeId);
    const heartbeat = await this.nodeRepository.getNodeHeartbeat(nodeId);
    const sessionCount = await this.sessionRepository.getNodeSessionCount(nodeId);

    return {
      nodeId,
      state: nodeInfo.state,
      isHealthy: isAlive && nodeInfo.state !== NodeState.STOPPED,
      lastHeartbeat: heartbeat || 0,
      sessionCount,
    };
  }

  /**
   * Get health status for all nodes
   */
  async getAllNodeHealthStatus(): Promise<NodeHealthStatus[]> {
    const nodes = await this.nodeRepository.getAllNodes();
    const statuses: NodeHealthStatus[] = [];

    for (const node of nodes) {
      const isAlive = await this.nodeRepository.isNodeAlive(node.nodeId);
      const heartbeat = await this.nodeRepository.getNodeHeartbeat(node.nodeId);
      const sessionCount = await this.sessionRepository.getNodeSessionCount(node.nodeId);

      statuses.push({
        nodeId: node.nodeId,
        state: node.state,
        isHealthy: isAlive && node.state !== NodeState.STOPPED,
        lastHeartbeat: heartbeat || 0,
        sessionCount,
      });
    }

    return statuses;
  }

  /**
   * Check if a node is alive
   */
  async isNodeAlive(nodeId: string): Promise<boolean> {
    return await this.nodeRepository.isNodeAlive(nodeId);
  }

  /**
   * Remove a node from the cluster
   */
  async removeNode(nodeId: string): Promise<void> {
    await this.nodeRepository.removeNode(nodeId);
    logger.info('Node removed', { nodeId });
  }
}
