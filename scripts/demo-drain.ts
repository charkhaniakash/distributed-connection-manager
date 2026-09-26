#!/usr/bin/env ts-node

import WebSocket from 'ws';

/**
 * Demo script showing graceful node draining
 */

const NODE_URL = 'ws://localhost:3001/ws'; // Direct to node-1
const NODE_API_URL = 'http://localhost:3001';

async function connectClient(orgId: string, clientId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${NODE_URL}?organizationId=${orgId}&clientId=${clientId}`);

    ws.on('open', () => {
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'connection.accepted') {
          console.log(`✓ Connected: ${clientId} (session: ${message.sessionId})`);
          resolve(ws);
        } else if (message.type === 'connection.rejected') {
          console.log(`✗ Connection rejected: ${clientId} (reason: ${message.reason})`);
          ws.close();
          reject(new Error(message.reason));
        }
      });
    });

    ws.on('close', () => {
      console.log(`✗ Disconnected: ${clientId}`);
    });

    ws.on('error', reject);
  });
}

async function getNodeInfo(): Promise<void> {
  const response = await fetch(`${NODE_API_URL}/nodes/node-1`);
  const data = await response.json();

  console.log('\nNode-1 Status:');
  console.log(`  State: ${data.state}`);
  console.log(`  Active sessions: ${data.sessionCount}`);
}

async function drainNode(): Promise<void> {
  const response = await fetch(`${NODE_API_URL}/nodes/node-1/drain`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Failed to drain node: ${response.statusText}`);
  }

  console.log('✓ Drain initiated');
}

async function main(): Promise<void> {
  console.log('=== Demo: Graceful Node Draining ===\n');

  console.log('1. Connecting 3 clients to node-1...\n');
  const connections: WebSocket[] = [];

  for (let i = 1; i <= 3; i++) {
    try {
      const ws = await connectClient('demo-org', `client-${i}`);
      connections.push(ws);
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Failed to connect client-${i}`);
    }
  }

  await getNodeInfo();

  console.log('\n2. Starting drain on node-1...\n');
  await drainNode();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  await getNodeInfo();

  console.log('\n3. Attempting to connect new client (should fail)...\n');
  try {
    await connectClient('demo-org', 'client-new');
  } catch (error) {
    console.log('Expected: New connections are rejected during drain');
  }

  console.log('\n4. Existing connections should remain active.');
  console.log('   Disconnecting them manually...\n');

  await new Promise((resolve) => setTimeout(resolve, 2000));
  connections.forEach((ws) => ws.close());

  console.log('\n5. Waiting for drain to complete...\n');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  await getNodeInfo();

  console.log('\n=== Demo Complete ===');
  console.log('Node-1 should now be in STOPPED state.');
  console.log('Restart with: docker compose restart node-1');
  process.exit(0);
}

main().catch((error) => {
  console.error('Demo failed:', error);
  process.exit(1);
});
