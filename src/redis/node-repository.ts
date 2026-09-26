import { RedisClientType } from 'redis';
import { NodeInfo, NodeState } from '../types';
import { RedisKeys } from '../utils/redis-keys';
import { logger } from '../utils/logger';
import { config } from '../config/config';

export class NodeRepository {
  constructor(private redis: RedisClientType) {}

  async registerNode(nodeInfo: NodeInfo): Promise<void> {
    const infoKey = RedisKeys.nodeInfo(nodeInfo.nodeId);
    const stateKey = RedisKeys.nodeState(nodeInfo.nodeId);
    const allNodesKey = RedisKeys.allNodes();
    const ttlSeconds = Math.ceil(config.nodeFailureTimeoutMs / 1000);

    await this.redis.hSet(infoKey, {
      nodeId: nodeInfo.nodeId,
      state: nodeInfo.state,
      lastHeartbeat: nodeInfo.lastHeartbeat.toString(),
      port: nodeInfo.port.toString(),
    });

    await this.redis.set(stateKey, nodeInfo.state);
    await this.redis.sAdd(allNodesKey, nodeInfo.nodeId);

    // Set initial heartbeat
    const heartbeatKey = RedisKeys.nodeHeartbeat(nodeInfo.nodeId);
    await this.redis.set(heartbeatKey, Date.now().toString(), {
      EX: ttlSeconds,
    });

    logger.info('Node registered', { nodeId: nodeInfo.nodeId, state: nodeInfo.state });
  }

  async updateNodeState(nodeId: string, state: NodeState): Promise<void> {
    const infoKey = RedisKeys.nodeInfo(nodeId);
    const stateKey = RedisKeys.nodeState(nodeId);

    await this.redis.hSet(infoKey, 'state', state);
    await this.redis.set(stateKey, state);

    logger.info('Node state updated', { nodeId, state });
  }

  async updateNodeHeartbeat(nodeId: string): Promise<void> {
    const key = RedisKeys.nodeHeartbeat(nodeId);
    const ttlSeconds = Math.ceil(config.nodeFailureTimeoutMs / 1000);

    await this.redis.set(key, Date.now().toString(), {
      EX: ttlSeconds,
    });
  }

  async getNodeHeartbeat(nodeId: string): Promise<number | null> {
    const key = RedisKeys.nodeHeartbeat(nodeId);
    const value = await this.redis.get(key);
    return value ? parseInt(value, 10) : null;
  }

  async isNodeAlive(nodeId: string): Promise<boolean> {
    const key = RedisKeys.nodeHeartbeat(nodeId);
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  async getNodeInfo(nodeId: string): Promise<NodeInfo | null> {
    const key = RedisKeys.nodeInfo(nodeId);
    const data = await this.redis.hGetAll(key);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    return {
      nodeId: data.nodeId,
      state: data.state as NodeState,
      lastHeartbeat: parseInt(data.lastHeartbeat, 10),
      port: parseInt(data.port, 10),
    };
  }

  async getAllNodes(): Promise<NodeInfo[]> {
    const allNodesKey = RedisKeys.allNodes();
    const nodeIds = await this.redis.sMembers(allNodesKey);
    const nodes: NodeInfo[] = [];

    for (const nodeId of nodeIds) {
      const nodeInfo = await this.getNodeInfo(nodeId);
      if (nodeInfo) {
        const heartbeat = await this.getNodeHeartbeat(nodeId);
        if (heartbeat) {
          nodeInfo.lastHeartbeat = heartbeat;
        }
        nodes.push(nodeInfo);
      }
    }

    return nodes;
  }

  async findDeadNodes(): Promise<string[]> {
    const allNodesKey = RedisKeys.allNodes();
    const nodeIds = await this.redis.sMembers(allNodesKey);
    const deadNodes: string[] = [];

    for (const nodeId of nodeIds) {
      const nodeInfo = await this.getNodeInfo(nodeId);
      if (!nodeInfo) {
        continue;
      }

      // Skip nodes that are already marked as STOPPED
      if (nodeInfo.state === NodeState.STOPPED) {
        continue;
      }

      const isAlive = await this.isNodeAlive(nodeId);
      if (!isAlive) {
        deadNodes.push(nodeId);
      }
    }

    return deadNodes;
  }

  async removeNode(nodeId: string): Promise<void> {
    const infoKey = RedisKeys.nodeInfo(nodeId);
    const stateKey = RedisKeys.nodeState(nodeId);
    const heartbeatKey = RedisKeys.nodeHeartbeat(nodeId);
    const allNodesKey = RedisKeys.allNodes();

    await this.redis.del(infoKey);
    await this.redis.del(stateKey);
    await this.redis.del(heartbeatKey);
    await this.redis.sRem(allNodesKey, nodeId);

    logger.info('Node removed', { nodeId });
  }
}
