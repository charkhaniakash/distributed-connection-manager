#!/bin/bash
# Reset all Redis state — useful when you want a clean cluster before demoing.

echo "🧹 Flushing all Redis data..."
docker exec distributed-connection-manager-redis-1 redis-cli FLUSHALL

echo "✓ Redis cleared."
echo ""
echo "Nodes will re-register on their next heartbeat (within a few seconds)."
echo "Open the dashboard at http://localhost:5173 to drive the system from the Playground panel."
