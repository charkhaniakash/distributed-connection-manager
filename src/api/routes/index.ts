import { Router } from 'express';
import { HealthController } from '../controllers/health-controller';
import { NodesController } from '../controllers/nodes-controller';
import { OrganizationsController } from '../controllers/organizations-controller';
import { SessionsController } from '../controllers/sessions-controller';
import { StatsController } from '../controllers/stats-controller';

export function createRoutes(
  healthController: HealthController,
  nodesController: NodesController,
  organizationsController: OrganizationsController,
  sessionsController: SessionsController,
  statsController: StatsController
): Router {
  const router = Router();

  // Health
  router.get('/health', (req, res) => healthController.getHealth(req, res));

  // Nodes
  router.get('/nodes', (req, res) => nodesController.getAllNodes(req, res));
  router.get('/nodes/:nodeId', (req, res) => nodesController.getNode(req, res));
  router.post('/nodes/:nodeId/drain', (req, res) => nodesController.drainNode(req, res));

  // Organizations
  router.get('/organizations/:organizationId', (req, res) =>
    organizationsController.getOrganization(req, res)
  );
  router.put('/organizations/:organizationId/limit', (req, res) =>
    organizationsController.setOrganizationLimit(req, res)
  );

  // Sessions
  router.get('/sessions/:sessionId', (req, res) => sessionsController.getSession(req, res));

  // Stats
  router.get('/stats', (req, res) => statsController.getStats(req, res));

  return router;
}
