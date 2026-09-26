#!/usr/bin/env ts-node

import WebSocket from 'ws';

/**
 * Simple test script to connect a single client
 * Usage: ts-node scripts/test-connection.ts [orgId] [clientId]
 */

const NGINX_URL = 'ws://localhost:8080/ws';

async function connectClient(orgId: string, clientId: string): Promise<void> {
  console.log(`Connecting to ${NGINX_URL}...`);
  console.log(`Organization: ${orgId}`);
  console.log(`Client: ${clientId}\n`);

  const ws = new WebSocket(`${NGINX_URL}?organizationId=${orgId}&clientId=${clientId}`);

  ws.on('open', () => {
    console.log('✓ WebSocket connected');
  });

  ws.on('message', (data: WebSocket.Data) => {
    const message = JSON.parse(data.toString());
    console.log('Received:', JSON.stringify(message, null, 2));

    if (message.type === 'connection.accepted') {
      console.log(`\n✓ Connection accepted!`);
      console.log(`  Session ID: ${message.sessionId}`);
      console.log(`  Node: ${message.nodeId}`);
    } else if (message.type === 'connection.rejected') {
      console.log(`\n✗ Connection rejected!`);
      console.log(`  Reason: ${message.reason}`);
      process.exit(1);
    }
  });

  ws.on('close', () => {
    console.log('\n✗ Connection closed');
    process.exit(0);
  });

  ws.on('error', (error: Error) => {
    console.error('\n✗ Error:', error.message);
    process.exit(1);
  });

  // Keep connection alive
  console.log('\nConnection active. Press Ctrl+C to disconnect.\n');
}

const orgId = process.argv[2] || 'test-org';
const clientId = process.argv[3] || `client-${Date.now()}`;

connectClient(orgId, clientId).catch((error) => {
  console.error('Failed:', error);
  process.exit(1);
});
