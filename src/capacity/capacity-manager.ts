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
  local orgs_all_key = KEYS[5]
  
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
  
  -- Track organization in orgs:all set
  redis.call('SADD', orgs_all_key, org_id)
  
  return {2, new_org_count, new_global_count}  -- 2 = SUCCESS
`;

/**
 * Lua script for releasing an orphaned reservation
 * Used only when capacity was reserved but session creation failed,
 * so no session key exists to drive atomicCleanupSession
 */
const RELEASE_ORPHANED_RESERVATION_SCRIPT = `
  local org_count_key = KEYS[1]
  local global_count_key = KEYS[2]

  local org_count = redis.call('GET', org_count_key)
  if org_count and tonumber(org_count) > 0 then
    redis.call('DECR', org_count_key)
  end

  local global_count = redis.call('GET', global_count_key)
  if global_count and tonumber(global_count) > 0 then
    redis.call('DECR', global_count_key)
  end

  return 1
`;

/**
 * Lua script for atomic session cleanup
 * Ensures session cleanup and capacity release happen atomically
 * This prevents double-decrement when both disconnect and recovery race
 */
const CLEANUP_SESSION_SCRIPT = `
  local session_key = KEYS[1]
  
  -- Get session data
  local org_id = redis.call('HGET', session_key, 'organizationId')
  local node_id = redis.call('HGET', session_key, 'nodeId')
  
  -- If session doesn't exist, already cleaned up
  if not org_id or not node_id then
    return 0
  end
  
  -- Build derived keys
  local org_sessions_key = 'org:' .. org_id .. ':sessions'
  local node_sessions_key = 'node:' .. node_id .. ':sessions'
  local org_count_key = 'org:' .. org_id .. ':active_count'
  local global_count_key = 'global:active_count'
  
  -- Get session ID from the key
  local session_id = string.match(session_key, 'session:(.+)')
  
  -- Delete session
  redis.call('DEL', session_key)
  
  -- Remove from sets
  redis.call('SREM', org_sessions_key, session_id)
  redis.call('SREM', node_sessions_key, session_id)
  
  -- Decrement counters (with guard)
  local org_count = redis.call('GET', org_count_key)
  if org_count and tonumber(org_count) > 0 then
    redis.call('DECR', org_count_key)
  end
  
  local global_count = redis.call('GET', global_count_key)
  if global_count and tonumber(global_count) > 0 then
    redis.call('DECR', global_count_key)
  end
  
  return 1
`;

/**
 * CapacityManager handles all capacity reservation and release operations
 * Uses atomic Lua scripts to ensure distributed correctness
 */
export class CapacityManager {
  private reserveScriptSha: string | null = null;
  private cleanupScriptSha: string | null = null;
  private releaseOrphanedScriptSha: string | null = null;

  constructor(private redis: RedisClientType) {}

  /**
   * Load Lua scripts into Redis for better performance
   * Scripts are loaded once and then called by their SHA hash
   */
  async loadScripts(): Promise<void> {
    try {
      this.reserveScriptSha = await this.redis.scriptLoad(RESERVE_CAPACITY_SCRIPT);
      this.cleanupScriptSha = await this.redis.scriptLoad(CLEANUP_SESSION_SCRIPT);
      this.releaseOrphanedScriptSha = await this.redis.scriptLoad(
        RELEASE_ORPHANED_RESERVATION_SCRIPT
      );
      logger.info('Capacity management Lua scripts loaded', {
        reserveSha: this.reserveScriptSha,
        cleanupSha: this.cleanupScriptSha,
        releaseOrphanedSha: this.releaseOrphanedScriptSha,
      });
    } catch (error) {
      logger.error('Failed to load Lua scripts', error);
      throw error;
    }
  }

  /**
   * Release capacity that was reserved but never used because session
   * creation failed. Not for normal disconnect flow — atomicCleanupSession
   * handles that. Idempotent-safe due to the >0 guard in Lua.
   */
  async releaseOrphanedReservation(organizationId: string): Promise<void> {
    const orgCountKey = RedisKeys.orgActiveCount(organizationId);
    const globalCountKey = RedisKeys.globalActiveCount();

    try {
      if (this.releaseOrphanedScriptSha) {
        await this.redis.evalSha(this.releaseOrphanedScriptSha, {
          keys: [orgCountKey, globalCountKey],
          arguments: [],
        });
      } else {
        await this.redis.eval(RELEASE_ORPHANED_RESERVATION_SCRIPT, {
          keys: [orgCountKey, globalCountKey],
          arguments: [],
        });
      }

      logger.debug('Orphaned reservation released', { organizationId });
    } catch (error) {
      logger.error('Failed to release orphaned reservation', error, { organizationId });
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
    const orgsAllKey = 'orgs:all';

    try {
      let result: number[];

      if (this.reserveScriptSha) {
        // Use pre-loaded script for better performance
        result = (await this.redis.evalSha(this.reserveScriptSha, {
          keys: [orgLimitKey, orgCountKey, globalCapacityKey, globalCountKey, orgsAllKey],
          arguments: [organizationId, defaultOrgLimit.toString(), globalCapacity.toString()],
        })) as number[];
      } else {
        // Fallback to inline script
        result = (await this.redis.eval(RESERVE_CAPACITY_SCRIPT, {
          keys: [orgLimitKey, orgCountKey, globalCapacityKey, globalCountKey, orgsAllKey],
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
   * Atomically cleanup a session and release its capacity
   * This operation is truly idempotent - safe to call multiple times for the same session
   * 
   * The Lua script ensures that cleanup only happens once even if both disconnect
   * and recovery race for the same session
   */
  async atomicCleanupSession(sessionId: string): Promise<boolean> {
    const sessionKey = RedisKeys.session(sessionId);

    try {
      let result: number;

      if (this.cleanupScriptSha) {
        result = (await this.redis.evalSha(this.cleanupScriptSha, {
          keys: [sessionKey],
          arguments: [],
        })) as number;
      } else {
        result = (await this.redis.eval(CLEANUP_SESSION_SCRIPT, {
          keys: [sessionKey],
          arguments: [],
        })) as number;
      }

      if (result === 1) {
        logger.debug('Session cleaned up atomically', { sessionId });
        return true;
      } else {
        logger.debug('Session already cleaned up', { sessionId });
        return false;
      }
    } catch (error) {
      logger.error('Failed to cleanup session', error, { sessionId });
      throw error;
    }
  }
}
