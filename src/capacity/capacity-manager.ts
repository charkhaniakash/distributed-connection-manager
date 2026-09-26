import { RedisClientType } from 'redis';
import { CapacityReservationResult, CapacityReservation } from '../types';
import { RedisKeys } from '../utils/redis-keys';
import { logger } from '../utils/logger';

/**
 * Lua script for atomic capacity reservation
 * This ensures that both organization and global capacity are checked and reserved atomically
 * to prevent race conditions when multiple nodes attempt to reserve the last available slot
 */
const RESERVE_CAPACITY_SCRIPT = `
  local org_limit_key = KEYS[1]
  local org_count_key = KEYS[2]
  local global_capacity_key = KEYS[3]
  local global_count_key = KEYS[4]
  
  local org_id = ARGV[1]
  local default_org_limit = tonumber(ARGV[2])
  local global_capacity = tonumber(ARGV[3])
  
  -- Get organization limit (use default if not set)
  local org_limit = redis.call('GET', org_limit_key)
  if not org_limit then
    org_limit = default_org_limit
  else
    org_limit = tonumber(org_limit)
  end
  
  -- Get current organization count
  local org_count = redis.call('GET', org_count_key)
  if not org_count then
    org_count = 0
  else
    org_count = tonumber(org_count)
  end
  
  -- Check organization limit
  if org_count >= org_limit then
    return {0, org_count, 0}  -- 0 = ORGANIZATION_LIMIT_REACHED
  end
  
  -- Get global capacity limit
  local global_cap = redis.call('GET', global_capacity_key)
  if not global_cap then
    global_cap = global_capacity
  else
    global_cap = tonumber(global_cap)
  end
  
  -- Get current global count
  local global_count = redis.call('GET', global_count_key)
  if not global_count then
    global_count = 0
  else
    global_count = tonumber(global_count)
  end
  
  -- Check global capacity
  if global_count >= global_cap then
    return {1, org_count, global_count}  -- 1 = GLOBAL_CAPACITY_REACHED
  end
  
  -- Both checks passed - reserve capacity atomically
  local new_org_count = redis.call('INCR', org_count_key)
  local new_global_count = redis.call('INCR', global_count_key)
  
  return {2, new_org_count, new_global_count}  -- 2 = SUCCESS
`;

/**
 * Lua script for atomic capacity release
 * Ensures both organization and global counts are decremented atomically and safely
 * Prevents counts from going below zero
 */
const RELEASE_CAPACITY_SCRIPT = `
  local org_count_key = KEYS[1]
  local global_count_key = KEYS[2]
  
  -- Decrement organization count
  local org_count = redis.call('GET', org_count_key)
  if org_count and tonumber(org_count) > 0 then
    redis.call('DECR', org_count_key)
  else
    redis.call('SET', org_count_key, 0)
  end
  
  -- Decrement global count
  local global_count = redis.call('GET', global_count_key)
  if global_count and tonumber(global_count) > 0 then
    redis.call('DECR', global_count_key)
  else
    redis.call('SET', global_count_key, 0)
  end
  
  return 1
`;

/**
 * CapacityManager handles all capacity reservation and release operations
 * Uses atomic Lua scripts to ensure distributed correctness
 */
export class CapacityManager {
  private reserveScriptSha: string | null = null;
  private releaseScriptSha: string | null = null;

  constructor(private redis: RedisClientType) {}

  /**
   * Load Lua scripts into Redis for better performance
   * Scripts are loaded once and then called by their SHA hash
   */
  async loadScripts(): Promise<void> {
    try {
      this.reserveScriptSha = await this.redis.scriptLoad(RESERVE_CAPACITY_SCRIPT);
      this.releaseScriptSha = await this.redis.scriptLoad(RELEASE_CAPACITY_SCRIPT);
      logger.info('Capacity management Lua scripts loaded', {
        reserveSha: this.reserveScriptSha,
        releaseSha: this.releaseScriptSha,
      });
    } catch (error) {
      logger.error('Failed to load Lua scripts', error);
      throw error;
    }
  }

  /**
   * Atomically reserve capacity for a connection
   * Checks both organization limit and global capacity in a single atomic operation
   * 
   * This prevents race conditions where multiple nodes might simultaneously
   * attempt to reserve the last available slot
   */
  async reserveCapacity(
    organizationId: string,
    defaultOrgLimit: number,
    globalCapacity: number
  ): Promise<CapacityReservation> {
    const orgLimitKey = RedisKeys.orgLimit(organizationId);
    const orgCountKey = RedisKeys.orgActiveCount(organizationId);
    const globalCapacityKey = RedisKeys.globalCapacity();
    const globalCountKey = RedisKeys.globalActiveCount();

    try {
      let result: number[];

      if (this.reserveScriptSha) {
        // Use pre-loaded script for better performance
        result = (await this.redis.evalSha(this.reserveScriptSha, {
          keys: [orgLimitKey, orgCountKey, globalCapacityKey, globalCountKey],
          arguments: [organizationId, defaultOrgLimit.toString(), globalCapacity.toString()],
        })) as number[];
      } else {
        // Fallback to inline script
        result = (await this.redis.eval(RESERVE_CAPACITY_SCRIPT, {
          keys: [orgLimitKey, orgCountKey, globalCapacityKey, globalCountKey],
          arguments: [organizationId, defaultOrgLimit.toString(), globalCapacity.toString()],
        })) as number[];
      }

      const [status, orgCount, globalCount] = result;

      if (status === 0) {
        logger.warn('Organization limit reached', { organizationId, count: orgCount });
        return {
          result: CapacityReservationResult.ORGANIZATION_LIMIT_REACHED,
          organizationCount: orgCount,
        };
      }

      if (status === 1) {
        logger.warn('Global capacity reached', { globalCount });
        return {
          result: CapacityReservationResult.GLOBAL_CAPACITY_REACHED,
          globalCount: globalCount,
        };
      }

      logger.debug('Capacity reserved', {
        organizationId,
        orgCount,
        globalCount,
      });

      return {
        result: CapacityReservationResult.SUCCESS,
        organizationCount: orgCount,
        globalCount: globalCount,
      };
    } catch (error) {
      logger.error('Failed to reserve capacity', error, { organizationId });
      throw error;
    }
  }

  /**
   * Atomically release capacity after a connection ends
   * This operation is idempotent - it's safe to call multiple times for the same session
   * 
   * The Lua script ensures counts never go below zero even if called multiple times
   */
  async releaseCapacity(organizationId: string): Promise<void> {
    const orgCountKey = RedisKeys.orgActiveCount(organizationId);
    const globalCountKey = RedisKeys.globalActiveCount();

    try {
      if (this.releaseScriptSha) {
        await this.redis.evalSha(this.releaseScriptSha, {
          keys: [orgCountKey, globalCountKey],
          arguments: [],
        });
      } else {
        await this.redis.eval(RELEASE_CAPACITY_SCRIPT, {
          keys: [orgCountKey, globalCountKey],
          arguments: [],
        });
      }

      logger.debug('Capacity released', { organizationId });
    } catch (error) {
      logger.error('Failed to release capacity', error, { organizationId });
      throw error;
    }
  }
}
