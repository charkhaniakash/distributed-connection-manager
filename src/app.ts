import express from 'express';
import { createServer } from 'http';
import { config, validateConfig } from './config/config';
import { logger } from './utils/logger';
import { redisClient } from './redis/redis-client';
import {
  SessionRepository,
  NodeRepository,
  CapacityRepository,
} from './redis';
import { CapacityManager } from './capacity';
import {
  ConnectionManager,
  ConnectionService,
  SessionManager,
} from './connection';
import {
  NodeManager,
  NodeHeartbeat,
  DrainService,
} from './node';
import {
  FailureDetector,
  SessionRecoveryService,
} from './recovery';
import {
  HealthController,
  NodesController,
  OrganizationsController,
  SessionsController,
  StatsController,
} from './api/controllers';
import { createRoutes } from './api/routes';
import { NodeState } from './types';

/**
 * Main application class
 * Coordinates initialization and lifecycle of all services
 */
class Application {
  private app = express();
  private server = createServer(this.app);

  // Repositories
  private sessionRepository!: SessionRepository;
  private nodeRepository!: NodeRepository;
  private capacityRepository!: CapacityRepository;

  // Services
  private capacityManager!: CapacityManager;
  private sessionManager!: SessionManager;
  private connectionService!: ConnectionService;
  private connectionManager!: ConnectionManager;
  private nodeManager!: NodeManager;
  private nodeHeartbeat!: NodeHeartbeat;
  private drainService!: DrainService;
  private sessionRecovery!: SessionRecoveryService;
  private failureDetector!: FailureDetector;

  async start(): Promise<void> {
    try {
      // Validate configuration
      validateConfig(config);
      logger.info('Configuration validated', { nodeId: config.nodeId, port: config.port });

      // Initialize dependencies
      await this.initializeRedis();
      this.initializeRepositories();
      await this.initializeServices();
      this.initializeAPI();
      this.initializeWebSocket();

      // Register node
      await this.nodeManager.registerNode();

      // Start background services
      this.nodeHeartbeat.start();
      this.failureDetector.start();

      // Transition to ACTIVE
      await this.nodeManager.activateNode();
      this.connectionManager.setNodeState(NodeState.ACTIVE);

      // Start HTTP server
      await this.startServer();

      logger.info('Application started successfully', {
        nodeId: config.nodeId,
        port: config.port,
      });

      // Setup graceful shutdown
      this.setupShutdownHandlers();
    } catch (error) {
      logger.error('Failed to start application', error);
      process.exit(1);
    }
  }

  private async initializeRedis(): Promise<void> {
    await redisClient.connect();
  }

  private initializeRepositories(): void {
    const redis = redisClient.getClient();
    this.sessionRepository = new SessionRepository(redis);
    this.nodeRepository = new NodeRepository(redis);
    this.capacityRepository = new CapacityRepository(redis);
  }

  private async initializeServices(): Promise<void> {
    // Capacity management
    this.capacityManager = new CapacityManager(redisClient.getClient());
    await this.capacityManager.loadScripts();
    await this.capacityRepository.initializeGlobalCapacity();

    // Session management
    this.sessionManager = new SessionManager(this.sessionRepository);

    // Connection management
    this.connectionService = new ConnectionService(
      this.capacityManager,
      this.sessionManager
    );
    this.connectionManager = new ConnectionManager(
      this.connectionService,
      this.sessionManager
    );

    // Node management
    this.nodeManager = new NodeManager(this.nodeRepository);
    this.nodeHeartbeat = new NodeHeartbeat(this.nodeRepository);
    this.drainService = new DrainService(
      this.nodeManager,
      this.connectionManager,
      this.sessionManager
    );

    // Recovery
    this.sessionRecovery = new SessionRecoveryService(
      this.sessionRepository,
      this.sessionManager,
      this.capacityManager
    );
    this.failureDetector = new FailureDetector(
      this.nodeRepository,
      this.sessionRecovery
    );
  }

  private initializeAPI(): void {
    this.app.use(express.json());

    // Create controllers
    const healthController = new HealthController(this.nodeManager);
    const nodesController = new NodesController(
      this.nodeManager,
      this.sessionManager,
      this.drainService
    );
    const organizationsController = new OrganizationsController(
      this.sessionManager,
      this.capacityRepository
    );
    const sessionsController = new SessionsController(this.sessionManager);
    const statsController = new StatsController(
      this.capacityRepository,
      this.nodeManager
    );

    // Setup routes
    const routes = createRoutes(
      healthController,
      nodesController,
      organizationsController,
      sessionsController,
      statsController
    );

    this.app.use('/', routes);
  }

  private initializeWebSocket(): void {
    this.connectionManager.initialize(this.server);
  }

  private async startServer(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(config.port, () => {
        logger.info('HTTP server listening', { port: config.port });
        resolve();
      });
    });
  }

  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string): Promise<void> => {
      logger.info('Shutdown signal received', { signal });

      try {
        // Stop accepting new connections
        this.nodeHeartbeat.stop();
        this.failureDetector.stop();

        // Close WebSocket server
        await this.connectionManager.shutdown();

        // Close HTTP server
        await new Promise<void>((resolve, reject) => {
          this.server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        });

        // Disconnect Redis
        await redisClient.disconnect();

        logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}

// Start application
const app = new Application();
app.start().catch((error) => {
  logger.error('Unhandled error', error);
  process.exit(1);
});
