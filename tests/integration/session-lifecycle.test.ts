import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient, RedisClientType } from 'redis';
import { SessionRepository } from '../../src/redis/session-repository';
import { SessionManager } from '../../src/connection/session-manager';
import { CapacityManager } from '../../src/capacity/capacity-manager';
import { SessionStatus } from '../../src/types';

describe('Session Lifecycle', () => {
  let redis: RedisClientType;
  let sessionRepository: SessionRepository;
  let sessionManager: SessionManager;
  let capacityManager: CapacityManager;

  beforeAll(async () => {
    redis = createClient({ url: 'redis://localhost:6379' });
    await redis.connect();
    sessionRepository = new SessionRepository(redis);
    capacityManager = new CapacityManager(redis);
    await capacityManager.loadScripts();
    sessionManager = new SessionManager(sessionRepository, capacityManager);
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    await redis.flushDb();
  });

  it('should create a session with correct initial state', async () => {
    const session = await sessionManager.createSession({
      clientId: 'client-123',
      organizationId: 'org-test',
      nodeId: 'node-1',
    });

    expect(session.sessionId).toBeDefined();
    expect(session.clientId).toBe('client-123');
    expect(session.organizationId).toBe('org-test');
    expect(session.nodeId).toBe('node-1');
    expect(session.status).toBe(SessionStatus.STARTING);
  });

  it('should activate a session', async () => {
    const session = await sessionManager.createSession({
      clientId: 'client-123',
      organizationId: 'org-test',
      nodeId: 'node-1',
    });

    await sessionManager.activateSession(session.sessionId);

    const updated = await sessionManager.getSession(session.sessionId);
    expect(updated?.status).toBe(SessionStatus.ACTIVE);
  });

  it('should track session in organization and node sets', async () => {
    const session = await sessionManager.createSession({
      clientId: 'client-123',
      organizationId: 'org-test',
      nodeId: 'node-1',
    });

    const orgSessions = await sessionRepository.getOrganizationSessions('org-test');
    const nodeSessions = await sessionRepository.getNodeSessions('node-1');

    expect(orgSessions).toContain(session.sessionId);
    expect(nodeSessions).toContain(session.sessionId);
  });

  it('should cleanup session idempotently', async () => {
    const session = await sessionManager.createSession({
      clientId: 'client-123',
      organizationId: 'org-test',
      nodeId: 'node-1',
    });

    // Need to reserve capacity first
    await capacityManager.reserveCapacity('org-test', 10, 100);

    // Clean up multiple times
    await sessionManager.cleanupSession(session.sessionId);
    await sessionManager.cleanupSession(session.sessionId);
    await sessionManager.cleanupSession(session.sessionId);

    const retrieved = await sessionManager.getSession(session.sessionId);
    expect(retrieved).toBeNull();

    const orgSessions = await sessionRepository.getOrganizationSessions('org-test');
    const nodeSessions = await sessionRepository.getNodeSessions('node-1');

    expect(orgSessions).not.toContain(session.sessionId);
    expect(nodeSessions).not.toContain(session.sessionId);
    
    // Capacity should be released exactly once
    const orgCount = await redis.get('org:org-test:active_count');
    expect(parseInt(orgCount || '0')).toBe(0);
  });

  it('should retrieve all sessions for an organization', async () => {
    await sessionManager.createSession({
      clientId: 'client-1',
      organizationId: 'org-test',
      nodeId: 'node-1',
    });

    await sessionManager.createSession({
      clientId: 'client-2',
      organizationId: 'org-test',
      nodeId: 'node-2',
    });

    const sessions = await sessionManager.getOrganizationSessions('org-test');
    expect(sessions).toHaveLength(2);
  });
});
