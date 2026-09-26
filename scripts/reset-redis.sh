#!/bin/bash
# Reset Redis data for clean demos

echo "🧹 Flushing all Redis data..."
docker exec distributed-connection-manager-redis-1 redis-cli FLUSHALL

echo "✓ Redis cleared!"
echo ""
echo "You can now run demo scripts with clean state:"
echo "  node scripts/demo-limits.ts"
echo "  node scripts/demo-crash.ts"
echo "  node scripts/demo-drain.ts"
