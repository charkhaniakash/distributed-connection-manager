# Design

## What it is

Three identical Node.js processes sit behind Nginx and share state through a single Redis instance. Each process accepts long-lived WebSocket connections and enforces two limits: a per-organization cap and a global cluster-wide cap.

```
Clients → Nginx (round-robin) → node-1 / node-2 / node-3 → Redis
```

Nodes are stateless in their business decisions — everything that must be consistent across nodes (session records, counters, org limits, node liveness) lives in Redis. In-memory state on a node is only the local `WebSocket` objects plus a few small caches (current node state, timers).

## Architecture

- **`api/`** — Express controllers, one per resource. Thin: parse, delegate, respond.
- **`connection/`** — `ConnectionService` orchestrates accept flow; `WebSocketHandler` owns a single socket; `ConnectionManager` owns the `ws` server; `SessionManager` sits on top of the session repository.
- **`capacity/`** — `CapacityManager` holds the atomic Lua scripts (reserve, cleanup, orphaned release).
- **`node/`** — `NodeManager` (state transitions), `NodeHeartbeat` (periodic Redis write), `DrainService` (graceful shutdown with timers).
- **`recovery/`** — `FailureDetector` polls Redis for dead nodes; `SessionRecoveryService` cleans up their sessions.
- **`redis/`** — one repository per aggregate (`SessionRepository`, `NodeRepository`, `CapacityRepository`) plus the client singleton.

Business layers depend on repositories, never on raw Redis. All keys are constructed by a single `RedisKeys` helper.

## How state is tracked

| Redis key | Purpose |
|---|---|
| `session:{sessionId}` | HASH of the session (client, org, node, timestamps, status). TTL = `SESSION_TIMEOUT_MS`; refreshed on heartbeat. |
| `org:{orgId}:sessions` | SET of session IDs, for org listing and per-org cleanup. |
| `node:{nodeId}:sessions` | SET of session IDs, for per-node cleanup after crash. |
| `org:{orgId}:active_count` | Integer, the counter checked against the org limit. |
| `org:{orgId}:limit` | Configured limit; falls back to `DEFAULT_ORG_LIMIT`. |
| `global:active_count` / `global:capacity` | Cluster-wide counter + max. |
| `node:{nodeId}:info` | HASH with the node’s state and port. |
| `node:{nodeId}:heartbeat` | Timestamp with TTL = `NODE_FAILURE_TIMEOUT_MS`. Expiry = node is dead. |
| `nodes:all` / `orgs:all` | Discovery sets. |

## The two hard problems

### 1. Capacity race — two nodes accepting the last slot

Solved with a single Lua script (`RESERVE_CAPACITY_SCRIPT`) that runs inside Redis. It reads both counters, checks both limits, and increments both — atomically. Redis is single-threaded so no other Lua or command interleaves. Result codes distinguish `ORGANIZATION_LIMIT_REACHED` / `GLOBAL_CAPACITY_REACHED` / `SUCCESS`.

If the WebSocket setup fails *after* the reserve, `releaseOrphanedReservation` (another small Lua script, guarded > 0) decrements both counters.

### 2. Double cleanup — disconnect and crash recovery for the same session

If a client disconnects at the same moment failure recovery runs, both flows race to clean up the same session. Naïve `check → delete → decrement` in TypeScript double-decrements the counters. The fix is a second Lua script (`CLEANUP_SESSION_SCRIPT`) that reads the session hash, `DEL`s it, `SREM`s the tracking sets, and decrements the counters — all in one atomic step. If the session hash doesn't exist, the whole script returns 0 and touches nothing. That makes cleanup genuinely idempotent under concurrent triggers.

## Failure handling

- **Heartbeat with TTL.** Every node writes `node:{nodeId}:heartbeat` every `HEARTBEAT_INTERVAL_MS` with an expiration equal to `NODE_FAILURE_TIMEOUT_MS`. If the process dies, the key vanishes on its own — no active cleanup needed by the dead node.
- **Failure detector.** Each live node runs `FailureDetector` on an interval. It scans `nodes:all`, and for anyone whose heartbeat key is missing (and whose state is not already `STOPPED`) it invokes `SessionRecoveryService.recoverNodeSessions`, which lists the dead node’s sessions and pipes each through the atomic cleanup script.
- **Idempotent recovery.** Because multiple live nodes may detect the same failure at the same time, recovery runs anywhere are safe; the atomic cleanup script is the guard.
- **Graceful drain.** `DrainService.startDrain()` flips the node to `DRAINING` (in Redis and in `ConnectionManager`, so new sockets get `NODE_DRAINING` and are rejected), then polls until active connections hit 0. If a hard timeout (`DRAIN_TIMEOUT_MS`) fires first, remaining sockets are closed — the same atomic cleanup path runs for each. The node then transitions to `STOPPED`. A companion `activate` endpoint calls `DrainService.reset()` and flips state back to `ACTIVE`, so a drained node can rejoin the cluster without restarting the container.

## Trade-offs I’d revisit

- **Single Redis is a SPOF.** Fine for a take-home; in production I’d run Redis in cluster or sentinel mode. All the code paths already treat Redis as the source of truth, so this is an infrastructure swap, not a rewrite.
- **Failure detection can take up to `2 × NODE_FAILURE_TIMEOUT_MS`.** The detector interval equals the timeout, so the worst case for detecting a dead node is one full interval plus one full TTL — ~30 s with defaults. Halving the interval would tighten this at the cost of extra Redis load.
- **Sequential reads in list endpoints.** `getAllNodes`, `getOrganizationSessions` etc. loop and call Redis once per element. For dozens of entries it’s fine; for hundreds I’d switch to `MGET` / pipelining or a hydrated read-model.
- **No cross-region replication or fair scheduling.** The assignment doesn’t need it and I intentionally didn’t build a consensus layer.
- **Redis pub/sub for state broadcast.** Nodes currently discover each other’s state changes through polling. For faster propagation (e.g. a drain reflecting instantly on other nodes) I’d add a small pub/sub channel and treat polling as the fallback.
- **WebSocket dead-peer detection.** Server pings clients but doesn’t track missing pongs; a hung client is only reaped when the session TTL expires. A ping/pong watchdog in `WebSocketHandler` would close half-dead sockets sooner.
- **`orgs:all` grows monotonically.** Once an org is seen it never leaves the discovery set, even if it drops to zero connections. In production I’d prune it on cleanup or move discovery to a scan-based approach.

## Why Redis

- Single-threaded execution model gives free serialization for Lua scripts — the whole race-condition story becomes “one atomic op.”
- TTL on keys is exactly the failure-detection primitive I need — no separate scheduler required.
- Ubiquitous, one dependency, one command to run in Docker.

## What’s intentionally out of scope

Authentication, message routing, chat semantics, billing, admin UI beyond a demo dashboard, per-tenant quotas beyond a plain integer limit, and any kind of horizontal Redis scaling. Adding any of these would change shape rather than the architecture above.
