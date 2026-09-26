import { RedisClientType } from 'redis';
import { RedisKeys } from '../utils/redis-keys';
import { logger } from '../utils/logger';
import { config } from '../config/config';

export class CapacityRepository {
  constructor(private redis: RedisClientType) {}

  async initializeGlobalCapacity(): Promise<void> {
    const key = RedisKeys.globalCapacity();
    const exists = await this.redis.exists(key);

    if (!exists) {
      await this.redis.set(key, config.globalCapacity.toString());
      logger.info('Global capacity initialized', { capacity: config.globalCapacity });
    }
  }

  async getGlobalCapacity(): Promise<number> {
    const key = RedisKeys.globalCapacity();
    const value = await this.redis.get(key);
    return value ? parseInt(value, 10) : config.globalCapacity;
  }

  async getGlobalActiveCount(): Promise<number> {
    const key = RedisKeys.globalActiveCount();
    const value = await this.redis.get(key);
    return value ? parseInt(value, 10) : 0;
  }

  async getOrganizationLimit(organizationId: string): Promise<number> {
    const key = RedisKeys.orgLimit(organizationId);
    const value = await this.redis.get(key);
    return value ? parseInt(value, 10) : config.defaultOrgLimit;
  }

  async setOrganizationLimit(organizationId: string, limit: number): Promise<void> {
    const key = RedisKeys.orgLimit(organizationId);
    await this.redis.set(key, limit.toString());
    logger.debug('Organization limit set', { organizationId, limit });
  }

  async getOrganizationActiveCount(organizationId: string): Promise<number> {
    const key = RedisKeys.orgActiveCount(organizationId);
    const value = await this.redis.get(key);
    return value ? parseInt(value, 10) : 0;
  }

  async getAllOrganizationIds(): Promise<string[]> {
    const key = 'orgs:all';
    return await this.redis.sMembers(key);
  }
}
