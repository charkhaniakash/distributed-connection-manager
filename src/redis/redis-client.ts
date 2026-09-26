import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';
import { config } from '../config/config';

/**
 * Redis client wrapper managing connection lifecycle
 */
class RedisClient {
  private client: RedisClientType | null = null;
  private isConnected = false;

  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    this.client = createClient({
      url: config.redisUrl,
      socket: {
        reconnectStrategy: (retries: number) => {
          if (retries > 10) {
            logger.error('Redis max reconnection attempts reached');
            return new Error('Max reconnection attempts reached');
          }
          const delay = Math.min(retries * 100, 3000);
          logger.warn(`Redis reconnecting in ${delay}ms`, { attempt: retries });
          return delay;
        },
      },
    });

    this.client.on('error', (err) => {
      logger.error('Redis client error', err);
    });

    this.client.on('connect', () => {
      logger.info('Redis client connecting');
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
      this.isConnected = true;
    });

    this.client.on('end', () => {
      logger.info('Redis client disconnected');
      this.isConnected = false;
    });

    await this.client.connect();
    logger.info('Redis connected', { url: config.redisUrl });
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      logger.info('Redis disconnected');
    }
  }

  getClient(): RedisClientType {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client is not connected');
    }
    return this.client;
  }
}

export const redisClient = new RedisClient();
