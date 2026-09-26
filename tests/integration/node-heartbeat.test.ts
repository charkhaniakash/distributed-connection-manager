import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createClient, RedisClientType } from 'redis';
import { NodeRepository } from '../../src/redis/node-repository';
import { NodeHeartbeat } from '../../src/node/node-heartbeat';
import { NodeState } from '../../src/types';

// Mock config
vi.mock('../../src/config/config', () => ({
  config: {
    nodeId: 'test-node',
    heartbeatIntervalMs: 100,
    nodeFailureTimeoutMs: 500,
  },
}));

describe('Node Heartbeat', () => {
  let redis: RedisClientType;
  let nodeRepository: NodeRepository;
  let nodeHeartbeat: NodeHeartbeat;

  beforeAll(async () => {
    redis = createClient({ url: 'redis://localhost:6379' });
    await redis.connect();
    nodeRepository = new NodeRepository(redis);
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    await redis.flushDb();
    nodeHeartbeat = new NodeHeartbeat(nodeRepository);
  });

  it('should send heartbeat when started', async () => {
    await nodeRepository.registerNode({
      nodeId: 'test-node',
      state: NodeState.ACTIVE,
      lastHeartbeat: Date.now(),
      port: 3001,
    });

    nodeHeartbeat.start();

    await new Promise((resolve) => setTimeout(resolve, 150));

    const heartbeat = await nodeRepository.getNodeHeartbeat('test-node');
    expect(heartbeat).toBeDefined();
    expect(heartbeat).toBeGreaterThan(0);

    nodeHeartbeat.stop();
  });

  it('should detect node as alive when heartbeat is recent', async () => {
    await nodeRepository.registerNode({
      nodeId: 'test-node',
      state: NodeState.ACTIVE,
      lastHeartbeat: Date.now(),
      port: 3001,
    });

    await nodeRepository.updateNodeHeartbeat('test-node');

    const isAlive = await nodeRepository.isNodeAlive('test-node');
    expect(isAlive).toBe(true);
  });

  it('should detect node as dead when heartbeat expires', async () => {
    await nodeRepository.registerNode({
      nodeId: 'test-node',
      state: NodeState.ACTIVE,
      lastHeartbeat: Date.now(),
      port: 3001,
    });

    // Wait for heartbeat to expire
    await new Promise((resolve) => setTimeout(resolve, 600));

    const isAlive = await nodeRepository.isNodeAlive('test-node');
    expect(isAlive).toBe(false);
  });

  it('should find dead nodes', async () => {
    // Register alive node
    await nodeRepository.registerNode({
      nodeId: 'node-alive',
      state: NodeState.ACTIVE,
      lastHeartbeat: Date.now(),
      port: 3001,
    });
    await nodeRepository.updateNodeHeartbeat('node-alive');

    // Register dead node (no recent heartbeat)
    await nodeRepository.registerNode({
      nodeId: 'node-dead',
      state: NodeState.ACTIVE,
      lastHeartbeat: Date.now(),
      port: 3002,
    });

    // Wait for dead node's heartbeat to expire
    await new Promise((resolve) => setTimeout(resolve, 600));

    const deadNodes = await nodeRepository.findDeadNodes();
    expect(deadNodes).toContain('node-dead');
    expect(deadNodes).not.toContain('node-alive');
  });
});
