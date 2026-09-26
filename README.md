# Multi-Node Connection Management System

A distributed WebSocket connection manager: 3 Node.js instances behind Nginx, sharing state through Redis, coordinating per-organization limits and global capacity via atomic Lua scripts.

For architecture, trade-offs and Redis data model see [DESIGN.md](./DESIGN.md).

---

## Prerequisites

- Docker + Docker Compose
- Node.js 18+ (only for running the dashboard)

## 1. Start the backend

From the repo root:

```bash
docker compose up --build
```

This starts:

| Service | Port |
|---|---|
| Redis | 6379 |
| node-1 / node-2 / node-3 | 3001 / 3002 / 3003 |
| Nginx (load balancer) | **8080** |

Quick sanity check:

```bash
curl http://localhost:8080/health
curl http://localhost:8080/nodes
```

## 2. Start the dashboard

In a second terminal:

```bash
cd dashboard
npm install
npm run dev
```

Open **http://localhost:5173**.

Everything you need to demo the system is on that one screen: live stats, per-node status, per-org bars, drain/activate buttons, and a **Playground** panel to open connections, set org limits, and fire the race scenario — all from clicks.

## 3. Run the tests

Tests need a local Redis. If Docker Compose is already up you can reuse its Redis on port 6379, otherwise start one:

```bash
docker run -d -p 6379:6379 redis:7-alpine
```

Then from the repo root:

```bash
npm install
npm test                    # all suites
npm run test:unit
npm run test:integration
npm run test:concurrency    # 50-vs-limit-5, race safety
```

## Useful commands

```bash
docker compose down                # stop everything
docker compose restart node-2      # restart a single node
npm run reset:redis                # flush Redis for a clean demo state
```

## Configuration

All configuration is via environment variables (see `docker-compose.yml`). Defaults:

| Variable | Default | Meaning |
|---|---|---|
| `GLOBAL_CAPACITY` | 1000 | Cluster-wide max concurrent sessions |
| `DEFAULT_ORG_LIMIT` | 100 | Per-org limit when none is set explicitly |
| `HEARTBEAT_INTERVAL_MS` | 5000 | How often each node refreshes its heartbeat |
| `NODE_FAILURE_TIMEOUT_MS` | 15000 | Heartbeat TTL; expiry = node considered dead |
| `DRAIN_TIMEOUT_MS` | 30000 | Hard timeout for graceful drain |

## Inspecting live state

```bash
docker exec -it distributed-connection-manager-redis-1 redis-cli

# Then, e.g.:
KEYS *
GET  global:active_count
GET  org:playground-org:active_count
SMEMBERS node:node-1:sessions
TTL  node:node-1:heartbeat
```
