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
  router.get('/health', (req, res) => void healthController.getHealth(req, res));

  // Nodes
  router.get('/nodes', (req, res) => void nodesController.getAllNodes(req, res));
  router.get('/nodes/:nodeId', (req, res) => void nodesController.getNode(req, res));
  router.post('/nodes/:nodeId/drain', (req, res) => void nodesController.drainNode(req, res));
  router.post('/nodes/:nodeId/activate', (req, res) => void nodesController.activateNode(req, res));

  // Organizations
  router.get('/organizations/:organizationId', (req, res) =>
    void organizationsController.getOrganization(req, res)
  );
  router.put('/organizations/:organizationId/limit', (req, res) =>
    void organizationsController.setOrganizationLimit(req, res)
  );

  // Sessions
  router.get('/sessions/:sessionId', (req, res) => void sessionsController.getSession(req, res));

  // Stats
  router.get('/stats', (req, res) => void statsController.getStats(req, res));

  return router;
}
