import { config as dotenvConfig } from 'dotenv';

// Load environment variables
dotenvConfig();

export interface AppConfig {
  nodeId: string;
  port: number;
  redisUrl: string;
  heartbeatIntervalMs: number;
  nodeFailureTimeoutMs: number;
  drainTimeoutMs: number;
  sessionHeartbeatIntervalMs: number;
  sessionTimeoutMs: number;
  globalCapacity: number;
  defaultOrgLimit: number;
  logLevel: string;
}

function getEnvVariable(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value && defaultValue === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || defaultValue!;
}

function getEnvNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (!value && defaultValue === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  const parsed = parseInt(value || String(defaultValue), 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid number for environment variable ${key}: ${value}`);
  }
  return parsed;
}

export const config: AppConfig = {
  nodeId: getEnvVariable('NODE_ID'),
  port: getEnvNumber('PORT'),
  redisUrl: getEnvVariable('REDIS_URL', 'redis://localhost:6379'),
  heartbeatIntervalMs: getEnvNumber('HEARTBEAT_INTERVAL_MS', 5000),
  nodeFailureTimeoutMs: getEnvNumber('NODE_FAILURE_TIMEOUT_MS', 15000),
  drainTimeoutMs: getEnvNumber('DRAIN_TIMEOUT_MS', 30000),
  sessionHeartbeatIntervalMs: getEnvNumber('SESSION_HEARTBEAT_INTERVAL_MS', 10000),
  sessionTimeoutMs: getEnvNumber('SESSION_TIMEOUT_MS', 30000),
  globalCapacity: getEnvNumber('GLOBAL_CAPACITY', 1000),
  defaultOrgLimit: getEnvNumber('DEFAULT_ORG_LIMIT', 100),
  logLevel: getEnvVariable('LOG_LEVEL', 'info'),
};

// Validate configuration
export function validateConfig(cfg: AppConfig): void {
  if (cfg.heartbeatIntervalMs >= cfg.nodeFailureTimeoutMs) {
    throw new Error(
      'HEARTBEAT_INTERVAL_MS must be less than NODE_FAILURE_TIMEOUT_MS'
    );
  }

  if (cfg.sessionHeartbeatIntervalMs >= cfg.sessionTimeoutMs) {
    throw new Error(
      'SESSION_HEARTBEAT_INTERVAL_MS must be less than SESSION_TIMEOUT_MS'
    );
  }

  if (cfg.globalCapacity <= 0) {
    throw new Error('GLOBAL_CAPACITY must be greater than 0');
  }

  if (cfg.defaultOrgLimit <= 0) {
    throw new Error('DEFAULT_ORG_LIMIT must be greater than 0');
  }
}
