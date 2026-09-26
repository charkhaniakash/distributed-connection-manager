import { Request, Response } from 'express';
import { NodeManager } from '../../node/node-manager';
import { SessionManager } from '../../connection/session-manager';
import { DrainService } from '../../node/drain-service';
import { ConnectionManager } from '../../connection/connection-manager';
import { NodeState } from '../../types';
import { logger } from '../../utils/logger';
import { config } from '../../config/config';

/**
 * Nodes management controller
 */
export class NodesController {
  constructor(
    private nodeManager: NodeManager,
    private sessionManager: SessionManager,
    private drainService: DrainService,
    private connectionManager: ConnectionManager
  ) {}

  /**
   * GET /nodes
   * Returns information about all nodes
   */
  async getAllNodes(_req: Request, res: Response): Promise<void> {
    try {
      const nodes = await this.nodeManager.getAllNodes();
      const nodesWithHealth = await Promise.all(
        nodes.map(async (node) => {
          const isAlive = await this.nodeManager.isNodeAlive(node.nodeId);
          const sessionCount = await this.sessionManager.getNodeSessionCount(node.nodeId);

          return {
            nodeId: node.nodeId,
            state: node.state,
            port: node.port,
            isAlive,
            lastHeartbeat: node.lastHeartbeat,
            sessionCount,
          };
        })
      );

      res.json({
        nodes: nodesWithHealth,
        totalNodes: nodesWithHealth.length,
      });
    } catch (error) {
      logger.error('Error getting nodes', error);
      res.status(500).json({
        error: 'Failed to retrieve nodes',
      });
    }
  }

  /**
   * GET /nodes/:nodeId
   * Returns information about a specific node
   */
  async getNode(req: Request, res: Response): Promise<void> {
    try {
      const { nodeId } = req.params;
      const nodeInfo = await this.nodeManager.getNodeInfo(nodeId);

      if (!nodeInfo) {
        res.status(404).json({ error: 'Node not found' });
        return;
      }

      const isAlive = await this.nodeManager.isNodeAlive(nodeId);
      const sessions = await this.sessionManager.getNodeSessions(nodeId);

      res.json({
        nodeId: nodeInfo.nodeId,
        state: nodeInfo.state,
        port: nodeInfo.port,
        isAlive,
        lastHeartbeat: nodeInfo.lastHeartbeat,
        sessionCount: sessions.length,
        sessions: sessions.map((s) => ({
          sessionId: s.sessionId,
          clientId: s.clientId,
          organizationId: s.organizationId,
          status: s.status,
          startedAt: s.startedAt,
        })),
      });
    } catch (error) {
      logger.error('Error getting node', error);
      res.status(500).json({
        error: 'Failed to retrieve node',
      });
    }
  }

  /**
   * POST /nodes/:nodeId/drain
   * Start draining a node. If the target is a different node, the request is
   * forwarded to that node inside the Docker network so callers do not have
   * to reach individual node ports directly.
   */
  async drainNode(req: Request, res: Response): Promise<void> {
    try {
      const { nodeId } = req.params;

      if (nodeId === config.nodeId) {
        await this.drainService.startDrain();
        res.json({
          message: 'Drain initiated',
          nodeId,
          status: this.drainService.getDrainStatus(),
        });
        return;
      }

      const nodeInfo = await this.nodeManager.getNodeInfo(nodeId);
      if (!nodeInfo) {
        res.status(404).json({ error: 'Node not found' });
        return;
      }

      // Forward the drain request to the owning node using its service name.
      // In docker-compose the service name equals the nodeId (node-1, node-2, node-3).
      const forwardUrl = `http://${nodeId}:${nodeInfo.port}/nodes/${nodeId}/drain`;
      const forwardResponse = await fetch(forwardUrl, { method: 'POST' });
      const body = await forwardResponse.json();
      res.status(forwardResponse.status).json(body);
    } catch (error) {
      logger.error('Error draining node', error);
      res.status(500).json({
        error: 'Failed to initiate drain',
      });
    }
  }

  /**
   * POST /nodes/:nodeId/activate
   * Bring a DRAINING or STOPPED node back into ACTIVE service.
   * Cross-node requests are forwarded to the owning node, same as drain.
   */
  async activateNode(req: Request, res: Response): Promise<void> {
    try {
      const { nodeId } = req.params;

      if (nodeId === config.nodeId) {
        this.drainService.reset();
        await this.nodeManager.updateNodeState(NodeState.ACTIVE);
        this.connectionManager.setNodeState(NodeState.ACTIVE);
        logger.info('NODE_ACTIVATED via API', { nodeId });
        res.json({
          message: 'Node activated',
          nodeId,
          state: NodeState.ACTIVE,
        });
        return;
      }

      const nodeInfo = await this.nodeManager.getNodeInfo(nodeId);
      if (!nodeInfo) {
        res.status(404).json({ error: 'Node not found' });
        return;
      }

      const forwardUrl = `http://${nodeId}:${nodeInfo.port}/nodes/${nodeId}/activate`;
      const forwardResponse = await fetch(forwardUrl, { method: 'POST' });
      const body = await forwardResponse.json();
      res.status(forwardResponse.status).json(body);
    } catch (error) {
      logger.error('Error activating node', error);
      res.status(500).json({
        error: 'Failed to activate node',
      });
    }
  }
}
