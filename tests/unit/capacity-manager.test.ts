import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient, RedisClientType } from 'redis';
import { CapacityManager } from '../../src/capacity/capacity-manager';
import { CapacityReservationResult } from '../../src/types';

describe('CapacityManager', () => {
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

  it('should reserve capacity successfully when under limits', async () => {
    const result = await capacityManager.reserveCapacity('org-test', 10, 100);

    expect(result.result).toBe(CapacityReservationResult.SUCCESS);
    expect(result.organizationCount).toBe(1);
    expect(result.globalCount).toBe(1);
  });

  it('should reject when organization limit is reached', async () => {
    // Reserve up to limit
    for (let i = 0; i < 5; i++) {
      await capacityManager.reserveCapacity('org-test', 5, 100);
    }

    // Try to reserve one more
    const result = await capacityManager.reserveCapacity('org-test', 5, 100);

    expect(result.result).toBe(CapacityReservationResult.ORGANIZATION_LIMIT_REACHED);
  });

  it('should reject when global capacity is reached', async () => {
    // Reserve up to global capacity
    for (let i = 0; i < 10; i++) {
      await capacityManager.reserveCapacity(`org-${i}`, 100, 10);
    }

    // Try to reserve one more
    const result = await capacityManager.reserveCapacity('org-new', 100, 10);

    expect(result.result).toBe(CapacityReservationResult.GLOBAL_CAPACITY_REACHED);
  });

  it('should release capacity correctly', async () => {
    await capacityManager.reserveCapacity('org-test', 10, 100);
    await capacityManager.releaseCapacity('org-test');

    // Should be able to reserve again
    const result = await capacityManager.reserveCapacity('org-test', 10, 100);
    expect(result.result).toBe(CapacityReservationResult.SUCCESS);
    expect(result.organizationCount).toBe(1);
  });

  it('should handle idempotent release safely', async () => {
    await capacityManager.reserveCapacity('org-test', 10, 100);
    
    // Release multiple times
    await capacityManager.releaseCapacity('org-test');
    await capacityManager.releaseCapacity('org-test');
    await capacityManager.releaseCapacity('org-test');

    // Counts should not go negative
    const orgCount = await redis.get('org:org-test:active_count');
    const globalCount = await redis.get('global:active_count');

    expect(parseInt(orgCount || '0')).toBe(0);
    expect(parseInt(globalCount || '0')).toBe(0);
  });
});
