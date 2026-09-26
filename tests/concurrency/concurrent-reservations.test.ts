import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient, RedisClientType } from 'redis';
import { CapacityManager } from '../../src/capacity/capacity-manager';
import { SessionRepository } from '../../src/redis/session-repository';
import { SessionManager } from '../../src/connection/session-manager';
import { CapacityReservationResult } from '../../src/types';

describe('Concurrent Capacity Reservations', () => {
  let redis: RedisClientType;
  let capacityManager: CapacityManager;

  beforeAll(async () => {
    redis = createClient({ url: 'redis://localhost:6379' });
    await redis.connect();
    capacityManager = new CapacityManager(redis);
    await capacityManager.loadScripts();
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    await redis.flushDb();
  });

  it('should never exceed organization limit with concurrent requests', async () => {
    const organizationId = 'org-concurrent-test';
    const orgLimit = 5;
    const concurrentRequests = 50;

    // Make many concurrent reservation attempts
    const promises = Array(concurrentRequests)
      .fill(null)
      .map(() => capacityManager.reserveCapacity(organizationId, orgLimit, 1000));

    const results = await Promise.all(promises);

    // Count successful reservations
    const successCount = results.filter(
      (r) => r.result === CapacityReservationResult.SUCCESS
    ).length;

    expect(successCount).toBe(orgLimit);

    // Verify final count in Redis
    const finalCount = await redis.get(`org:${organizationId}:active_count`);
    expect(parseInt(finalCount || '0')).toBe(orgLimit);
  });

  it('should never exceed global capacity with concurrent requests', async () => {
    const globalCapacity = 10;
    const concurrentRequests = 100;

    // Make concurrent requests from different organizations
    const promises = Array(concurrentRequests)
      .fill(null)
      .map((_, i) => capacityManager.reserveCapacity(`org-${i}`, 100, globalCapacity));

    const results = await Promise.all(promises);

    // Count successful reservations
    const successCount = results.filter(
      (r) => r.result === CapacityReservationResult.SUCCESS
    ).length;

    expect(successCount).toBe(globalCapacity);

    // Verify final global count
    const finalCount = await redis.get('global:active_count');
    expect(parseInt(finalCount || '0')).toBe(globalCapacity);
  });

  it('should handle concurrent reservations and releases correctly', async () => {
    const organizationId = 'org-mixed-test';
    const orgLimit = 20;

    // Concurrent reserves and releases
    const operations = Array(100)
      .fill(null)
      .map(async (_, i) => {
        if (i % 2 === 0) {
          return await capacityManager.reserveCapacity(organizationId, orgLimit, 1000);
        } else {
          await capacityManager.releaseCapacity(organizationId);
          return null;
        }
      });

    await Promise.all(operations);

    // Final count should never exceed limit
    const finalCount = await redis.get(`org:${organizationId}:active_count`);
    const count = parseInt(finalCount || '0');
    
    expect(count).toBeGreaterThanOrEqual(0);
    expect(count).toBeLessThanOrEqual(orgLimit);
  });
});

  it('should handle concurrent disconnect and recovery without double-decrement', async () => {
    const organizationId = 'org-race-test';
    const orgLimit = 10;

    // Create session repository and manager for this test
    const sessionRepository = new SessionRepository(redis);
    const sessionManager = new SessionManager(sessionRepository, capacityManager);

    // Reserve capacity and create sessions
    const sessionIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      await capacityManager.reserveCapacity(organizationId, orgLimit, 1000);
      const session = await sessionManager.createSession({
        clientId: `client-${i}`,
        organizationId,
        nodeId: 'test-node',
      });
      sessionIds.push(session.sessionId);
    }

    // Verify initial count
    let orgCount = await redis.get(`org:${organizationId}:active_count`);
    expect(parseInt(orgCount || '0')).toBe(5);

    // Simulate concurrent disconnect + recovery for all sessions (100 times each)
    const promises: Promise<void>[] = [];
    for (const sessionId of sessionIds) {
      for (let i = 0; i < 100; i++) {
        promises.push(sessionManager.cleanupSession(sessionId));
      }
    }

    await Promise.all(promises);

    // Final count should be 0 (all cleaned up exactly once)
    orgCount = await redis.get(`org:${organizationId}:active_count`);
    const finalCount = parseInt(orgCount || '0');
    
    expect(finalCount).toBe(0);

    const globalCount = await redis.get('global:active_count');
    expect(parseInt(globalCount || '0')).toBe(0);
  });
