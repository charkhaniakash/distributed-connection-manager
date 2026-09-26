import { RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import { Session, SessionStatus, SessionCreateParams } from '../types';
import { RedisKeys } from '../utils/redis-keys';
import { logger } from '../utils/logger';
import { config } from '../config/config';

export class SessionRepository {
  constructor(private redis: RedisClientType) {}

  async createSession(params: SessionCreateParams): Promise<Session> {
    const session: Session = {
      sessionId: uuidv4(),
      clientId: params.clientId,
      organizationId: params.organizationId,
      nodeId: params.nodeId,
      startedAt: Date.now(),
      lastHeartbeat: Date.now(),
      status: SessionStatus.STARTING,
    };

    const key = RedisKeys.session(session.sessionId);
    const ttlSeconds = Math.ceil(config.sessionTimeoutMs / 1000);

    await this.redis.hSet(key, {
      sessionId: session.sessionId,
      clientId: session.clientId,
      organizationId: session.organizationId,
      nodeId: session.nodeId,
      startedAt: session.startedAt.toString(),
      lastHeartbeat: session.lastHeartbeat.toString(),
      status: session.status,
    });

    await this.redis.expire(key, ttlSeconds);

    logger.debug('Session created', {
      sessionId: session.sessionId,
      organizationId: session.organizationId,
      nodeId: session.nodeId,
    });

    return session;
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const key = RedisKeys.session(sessionId);
    const data = await this.redis.hGetAll(key);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    return {
      sessionId: data.sessionId,
      clientId: data.clientId,
      organizationId: data.organizationId,
      nodeId: data.nodeId,
      startedAt: parseInt(data.startedAt, 10),
      lastHeartbeat: parseInt(data.lastHeartbeat, 10),
      status: data.status as SessionStatus,
    };
  }

  async updateSessionStatus(sessionId: string, status: SessionStatus): Promise<void> {
    const key = RedisKeys.session(sessionId);
    await this.redis.hSet(key, 'status', status);
    logger.debug('Session status updated', { sessionId, status });
  }

  async updateSessionHeartbeat(sessionId: string): Promise<void> {
    const key = RedisKeys.session(sessionId);
    const timestamp = Date.now();
    const ttlSeconds = Math.ceil(config.sessionTimeoutMs / 1000);

    await this.redis.hSet(key, 'lastHeartbeat', timestamp.toString());
    await this.redis.expire(key, ttlSeconds);
  }

  async deleteSession(sessionId: string): Promise<void> {
    const key = RedisKeys.session(sessionId);
    await this.redis.del(key);
    logger.debug('Session deleted', { sessionId });
  }

  async addSessionToOrganization(sessionId: string, organizationId: string): Promise<void> {
    const key = RedisKeys.orgSessions(organizationId);
    await this.redis.sAdd(key, sessionId);
  }

  async removeSessionFromOrganization(sessionId: string, organizationId: string): Promise<void> {
    const key = RedisKeys.orgSessions(organizationId);
    await this.redis.sRem(key, sessionId);
  }

  async getOrganizationSessions(organizationId: string): Promise<string[]> {
    const key = RedisKeys.orgSessions(organizationId);
    return await this.redis.sMembers(key);
  }

  async addSessionToNode(sessionId: string, nodeId: string): Promise<void> {
    const key = RedisKeys.nodeSessions(nodeId);
    await this.redis.sAdd(key, sessionId);
  }

  async removeSessionFromNode(sessionId: string, nodeId: string): Promise<void> {
    const key = RedisKeys.nodeSessions(nodeId);
    await this.redis.sRem(key, sessionId);
  }

  async getNodeSessions(nodeId: string): Promise<string[]> {
    const key = RedisKeys.nodeSessions(nodeId);
    return await this.redis.sMembers(key);
  }

  async getNodeSessionCount(nodeId: string): Promise<number> {
    const key = RedisKeys.nodeSessions(nodeId);
    return await this.redis.sCard(key);
  }
}
