import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient, RedisClientType } from 'redis';
import { CapacityManager } from '../../src/capacity/capacity-manager';
import { SessionRepository } from '../../src/redis/session-repository';
import { SessionManager } from '../../src/connection/session-manager';
import { CapacityReservationResult } from '../../src/types';

describe('Concurrent Capacity Reservations', () => {
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

  it('should never exceed organization limit with concurrent requests', async () => {
    const organizationId = 'org-concurrent-test';
    const orgLimit = 5;
    const concurrentRequests = 50;

    const promises = Array(concurrentRequests)
      .fill(null)
      .map(() => capacityManager.reserveCapacity(organizationId, orgLimit, 1000));

    const results = await Promise.all(promises);

    const successCount = results.filter(
      (r) => r.result === CapacityReservationResult.SUCCESS
    ).length;

    expect(successCount).toBe(orgLimit);

    const finalCount = await redis.get(`org:${organizationId}:active_count`);
    expect(parseInt(finalCount || '0', 10)).toBe(orgLimit);
  });

  it('should never exceed global capacity with concurrent requests', async () => {
    const globalCapacity = 10;
    const concurrentRequests = 100;

    const promises = Array(concurrentRequests)
      .fill(null)
      .map((_, i) => capacityManager.reserveCapacity(`org-${i}`, 100, globalCapacity));

    const results = await Promise.all(promises);

    const successCount = results.filter(
      (r) => r.result === CapacityReservationResult.SUCCESS
    ).length;

    expect(successCount).toBe(globalCapacity);

    const finalCount = await redis.get('global:active_count');
    expect(parseInt(finalCount || '0', 10)).toBe(globalCapacity);
  });

  it('should handle concurrent reserve + cleanup without exceeding the limit', async () => {
    const organizationId = 'org-mixed-test';
    const orgLimit = 20;

    // First reserve + create some sessions serially so we have IDs to clean up.
    const sessionIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const reservation = await capacityManager.reserveCapacity(
        organizationId,
        orgLimit,
        1000
      );
      if (reservation.result === CapacityReservationResult.SUCCESS) {
        const session = await sessionManager.createSession({
          clientId: `client-${i}`,
          organizationId,
          nodeId: 'test-node',
        });
        sessionIds.push(session.sessionId);
      }
    }

    // Now interleave more reservations with cleanups concurrently.
    const operations: Promise<unknown>[] = [];
    for (let i = 0; i < 100; i++) {
      if (i % 2 === 0) {
        operations.push(
          capacityManager.reserveCapacity(organizationId, orgLimit, 1000)
        );
      } else if (sessionIds.length > 0) {
        const id = sessionIds.pop()!;
        operations.push(sessionManager.cleanupSession(id));
      }
    }

    await Promise.all(operations);

    const finalCount = await redis.get(`org:${organizationId}:active_count`);
    const count = parseInt(finalCount || '0', 10);

    expect(count).toBeGreaterThanOrEqual(0);
    expect(count).toBeLessThanOrEqual(orgLimit);
  });

  it('should handle concurrent disconnect and recovery without double-decrement', async () => {
    const organizationId = 'org-race-test';
    const orgLimit = 10;

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

    let orgCount = await redis.get(`org:${organizationId}:active_count`);
    expect(parseInt(orgCount || '0', 10)).toBe(5);

    // Simulate many concurrent cleanup attempts for each session
    // (models disconnect + recovery racing for the same session id)
    const promises: Promise<void>[] = [];
    for (const sessionId of sessionIds) {
      for (let i = 0; i < 100; i++) {
        promises.push(sessionManager.cleanupSession(sessionId));
      }
    }

    await Promise.all(promises);

    // Every session must be cleaned up exactly once — counters land at 0.
    orgCount = await redis.get(`org:${organizationId}:active_count`);
    expect(parseInt(orgCount || '0', 10)).toBe(0);

    const globalCount = await redis.get('global:active_count');
    expect(parseInt(globalCount || '0', 10)).toBe(0);
  });
});
