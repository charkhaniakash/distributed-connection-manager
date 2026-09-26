#!/usr/bin/env ts-node

import WebSocket from 'ws';

/**
 * Demo script showing crash recovery
 * Note: This script demonstrates the concept, but you'll need to manually kill a node
 */

const NGINX_URL = 'ws://localhost:8080/ws';
const API_URL = 'http://localhost:8080';

async function connectClient(orgId: string, clientId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${NGINX_URL}?organizationId=${orgId}&clientId=${clientId}`);

    ws.on('open', () => {
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'connection.accepted') {
          console.log(`✓ Connected: ${clientId} on ${message.nodeId} (session: ${message.sessionId})`);
          resolve(ws);
        }
      });
    });

    ws.on('error', reject);
  });
}

async function getNodes(): Promise<void> {
  const response = await fetch(`${API_URL}/nodes`);
  const data = await response.json();

  console.log('\nNodes:');
  data.nodes.forEach((node: any) => {
    console.log(`  ${node.nodeId}: ${node.state}, sessions: ${node.sessionCount}, alive: ${node.isAlive}`);
  });
}

async function getStats(): Promise<void> {
  const response = await fetch(`${API_URL}/stats`);
  const data = await response.json();

  console.log('\nGlobal Stats:');
  console.log(`  Active sessions: ${data.totalActiveSessions}`);
  console.log(`  Nodes: ${data.nodeCount}`);
}

async function main(): Promise<void> {
  console.log('=== Demo: Node Crash Recovery ===\n');

  console.log('1. Connecting multiple clients...\n');
  const connections: WebSocket[] = [];

  for (let i = 1; i <= 9; i++) {
    try {
      const ws = await connectClient('demo-org', `client-${i}`);
      connections.push(ws);
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Failed to connect client-${i}`);
    }
  }

  await getNodes();
  await getStats();

  console.log('\n2. MANUAL STEP: Kill one of the nodes now (e.g., docker stop distributed-connection-manager-node-2-1)');
  console.log('   Press Enter after killing a node...');

  // Wait for user input
  await new Promise((resolve) => {
    process.stdin.once('data', resolve);
  });

  console.log('\n3. Waiting for failure detection (15 seconds)...\n');
  await new Promise((resolve) => setTimeout(resolve, 16000));

  await getNodes();
  await getStats();

  console.log('\n4. Sessions from the dead node should be recovered.');
  console.log('   The active session count should have decreased.\n');

  // Clean up
  connections.forEach((ws) => ws.close());

  console.log('\n=== Demo Complete ===');
  console.log('Restart the killed node with: docker compose up -d');
  process.exit(0);
}

main().catch((error) => {
  console.error('Demo failed:', error);
  process.exit(1);
});
