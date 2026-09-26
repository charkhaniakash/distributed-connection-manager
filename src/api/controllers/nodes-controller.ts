import { Request, Response } from 'express';
import { NodeManager } from '../../node/node-manager';
import { SessionManager } from '../../connection/session-manager';
import { DrainService } from '../../node/drain-service';
import { logger } from '../../utils/logger';
import { config } from '../../config/config';

/**
 * Nodes management controller
 */
export class NodesController {
  constructor(
    private nodeManager: NodeManager,
    private sessionManager: SessionManager,
    private drainService: DrainService
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
   * Start draining a node
   */
  async drainNode(req: Request, res: Response): Promise<void> {
    try {
      const { nodeId } = req.params;

      // Only allow draining the current node
      if (nodeId !== config.nodeId) {
        res.status(400).json({
          error: 'Can only drain the current node',
        });
        return;
      }

      await this.drainService.startDrain();

      res.json({
        message: 'Drain initiated',
        nodeId,
        status: this.drainService.getDrainStatus(),
      });
    } catch (error) {
      logger.error('Error draining node', error);
      res.status(500).json({
        error: 'Failed to initiate drain',
      });
    }
  }
}
