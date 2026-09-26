import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient, RedisClientType } from 'redis';
import { CapacityManager } from '../../src/capacity/capacity-manager';
import { SessionRepository } from '../../src/redis/session-repository';
import { SessionManager } from '../../src/connection/session-manager';
import { CapacityReservationResult } from '../../src/types';

describe('CapacityManager', () => {
  let redis: RedisClientType;
  let capacityManager: CapacityManager;
  let sessionRepository: SessionRepository;
  let sessionManager: SessionManager;

  beforeAll(async () => {
    redis = createClient({ url: 'redis://localhost:6379' });
    await redis.connect();
    capacityManager = new CapacityManager(redis);
    await capacityManager.loadScripts();
    sessionRepository = new SessionRepository(redis);
    sessionManager = new SessionManager(sessionRepository, capacityManager);
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    await redis.flushDb();
  });

  it('should reserve capacity successfully when under limits', async () => {
    const result = await capacityManager.reserveCapacity('org-test', 10, 100);

    expect(result.result).toBe(CapacityReservationResult.SUCCESS);
    expect(result.organizationCount).toBe(1);
    expect(result.globalCount).toBe(1);
  });

  it('should reject when organization limit is reached', async () => {
    for (let i = 0; i < 5; i++) {
      await capacityManager.reserveCapacity('org-test', 5, 100);
    }

    const result = await capacityManager.reserveCapacity('org-test', 5, 100);

    expect(result.result).toBe(CapacityReservationResult.ORGANIZATION_LIMIT_REACHED);
  });

  it('should reject when global capacity is reached', async () => {
    for (let i = 0; i < 10; i++) {
      await capacityManager.reserveCapacity(`org-${i}`, 100, 10);
    }

    const result = await capacityManager.reserveCapacity('org-new', 100, 10);

    expect(result.result).toBe(CapacityReservationResult.GLOBAL_CAPACITY_REACHED);
  });

  it('should release capacity via atomic session cleanup', async () => {
    await capacityManager.reserveCapacity('org-test', 10, 100);
    const session = await sessionManager.createSession({
      clientId: 'client-1',
      organizationId: 'org-test',
      nodeId: 'test-node',
    });

    await sessionManager.cleanupSession(session.sessionId);

    // Should be able to reserve again
    const result = await capacityManager.reserveCapacity('org-test', 10, 100);
    expect(result.result).toBe(CapacityReservationResult.SUCCESS);
    expect(result.organizationCount).toBe(1);
  });

  it('should handle idempotent cleanup safely', async () => {
    await capacityManager.reserveCapacity('org-test', 10, 100);
    const session = await sessionManager.createSession({
      clientId: 'client-1',
      organizationId: 'org-test',
      nodeId: 'test-node',
    });

    // Cleanup multiple times — must not double-decrement
    await sessionManager.cleanupSession(session.sessionId);
    await sessionManager.cleanupSession(session.sessionId);
    await sessionManager.cleanupSession(session.sessionId);

    const orgCount = await redis.get('org:org-test:active_count');
    const globalCount = await redis.get('global:active_count');

    expect(parseInt(orgCount || '0', 10)).toBe(0);
    expect(parseInt(globalCount || '0', 10)).toBe(0);
  });

  it('should release an orphaned reservation without going negative', async () => {
    await capacityManager.reserveCapacity('org-test', 10, 100);

    await capacityManager.releaseOrphanedReservation('org-test');
    // Extra calls must be safe (guarded > 0)
    await capacityManager.releaseOrphanedReservation('org-test');

    const orgCount = await redis.get('org:org-test:active_count');
    const globalCount = await redis.get('global:active_count');

    expect(parseInt(orgCount || '0', 10)).toBe(0);
    expect(parseInt(globalCount || '0', 10)).toBe(0);
  });
});
