import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient, RedisClientType } from 'redis';
import { SessionRepository } from '../../src/redis/session-repository';
import { SessionManager } from '../../src/connection/session-manager';
import { CapacityManager } from '../../src/capacity/capacity-manager';
import { SessionRecoveryService } from '../../src/recovery/session-recovery';

describe('Session Recovery', () => {
  let redis: RedisClientType;
  let sessionRepository: SessionRepository;
  let sessionManager: SessionManager;
  let capacityManager: CapacityManager;
  let recoveryService: SessionRecoveryService;

  beforeAll(async () => {
    redis = createClient({ url: 'redis://localhost:6379' });
    await redis.connect();
    sessionRepository = new SessionRepository(redis);
    capacityManager = new CapacityManager(redis);
    await capacityManager.loadScripts();
    sessionManager = new SessionManager(sessionRepository, capacityManager);
    recoveryService = new SessionRecoveryService(
      sessionRepository,
      sessionManager
    );
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    await redis.flushDb();
  });

  it('should recover sessions from a dead node', async () => {
    // Reserve capacity and create sessions
    await capacityManager.reserveCapacity('org-test', 10, 100);
    const session1 = await sessionManager.createSession({
      clientId: 'client-1',
      organizationId: 'org-test',
      nodeId: 'dead-node',
    });

    await capacityManager.reserveCapacity('org-test', 10, 100);
    const session2 = await sessionManager.createSession({
      clientId: 'client-2',
      organizationId: 'org-test',
      nodeId: 'dead-node',
    });

    // Verify sessions exist
    const beforeRecovery = await sessionRepository.getNodeSessions('dead-node');
    expect(beforeRecovery).toHaveLength(2);

    // Recover node sessions
    await recoveryService.recoverNodeSessions('dead-node');

    // Verify sessions are cleaned up
    const afterRecovery = await sessionRepository.getNodeSessions('dead-node');
    expect(afterRecovery).toHaveLength(0);

    const s1 = await sessionManager.getSession(session1.sessionId);
    const s2 = await sessionManager.getSession(session2.sessionId);
    expect(s1).toBeNull();
    expect(s2).toBeNull();

    // Verify capacity is released
    const orgCount = await redis.get('org:org-test:active_count');
    expect(parseInt(orgCount || '0')).toBe(0);
  });

  it('should handle recovery idempotently', async () => {
    await capacityManager.reserveCapacity('org-test', 10, 100);
    await sessionManager.createSession({
      clientId: 'client-1',
      organizationId: 'org-test',
      nodeId: 'dead-node',
    });

    // Recover multiple times
    await recoveryService.recoverNodeSessions('dead-node');
    await recoveryService.recoverNodeSessions('dead-node');
    await recoveryService.recoverNodeSessions('dead-node');

    // Capacity should still be correct
    const orgCount = await redis.get('org:org-test:active_count');
    const globalCount = await redis.get('global:active_count');

    expect(parseInt(orgCount || '0')).toBe(0);
    expect(parseInt(globalCount || '0')).toBe(0);
  });
});
