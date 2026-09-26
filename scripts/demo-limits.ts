#!/usr/bin/env ts-node

import WebSocket from 'ws';

/**
 * Demo script showing organization connection limits
 */

const NGINX_URL = 'ws://localhost:8080/ws';
const API_URL = 'http://localhost:8080';

async function setOrganizationLimit(orgId: string, limit: number): Promise<void> {
  const response = await fetch(`${API_URL}/organizations/${orgId}/limit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit }),
  });

  if (!response.ok) {
    throw new Error(`Failed to set limit: ${response.statusText}`);
  }

  console.log(`✓ Set limit for ${orgId} to ${limit}`);
}

async function connectClient(orgId: string, clientId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${NGINX_URL}?organizationId=${orgId}&clientId=${clientId}`);

    ws.on('open', () => {
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'connection.accepted') {
          console.log(`✓ Connection accepted: ${clientId} (session: ${message.sessionId})`);
          resolve(ws);
        } else if (message.type === 'connection.rejected') {
          console.log(`✗ Connection rejected: ${clientId} (reason: ${message.reason})`);
          ws.close();
          reject(new Error(message.reason));
        }
      });
    });

    ws.on('error', (error) => {
      reject(error);
    });
  });
}

async function getOrganizationInfo(orgId: string): Promise<void> {
  const response = await fetch(`${API_URL}/organizations/${orgId}`);
  const data = await response.json();

  console.log(`\nOrganization: ${orgId}`);
  console.log(`  Limit: ${data.limit}`);
  console.log(`  Active: ${data.activeCount}/${data.limit}`);
  console.log(`  Available: ${data.availableCapacity}`);
}

async function main(): Promise<void> {
  console.log('=== Demo: Organization Connection Limits ===\n');

  const orgId = 'demo-org';
  const limit = 3;

  // Set organization limit
  console.log(`1. Setting organization limit to ${limit}...\n`);
  await setOrganizationLimit(orgId, limit);
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Connect up to limit
  console.log(`\n2. Connecting ${limit} clients (should succeed)...\n`);
  const connections: WebSocket[] = [];

  for (let i = 1; i <= limit; i++) {
    try {
      const ws = await connectClient(orgId, `client-${i}`);
      connections.push(ws);
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Failed to connect client-${i}:`, error);
    }
  }

  await getOrganizationInfo(orgId);

  // Try to exceed limit
  console.log(`\n3. Attempting to exceed limit (should fail)...\n`);
  try {
    await connectClient(orgId, 'client-extra');
  } catch (error) {
    // Expected to fail
  }

  await getOrganizationInfo(orgId);

  // Disconnect one and try again
  console.log('\n4. Disconnecting one client...\n');
  connections[0].close();
  await new Promise((resolve) => setTimeout(resolve, 2000));

  await getOrganizationInfo(orgId);

  console.log('\n5. Connecting new client (should succeed now)...\n');
  try {
    const ws = await connectClient(orgId, 'client-new');
    connections.push(ws);
  } catch (error) {
    console.error('Failed to connect:', error);
  }

  await getOrganizationInfo(orgId);

  // Clean up
  console.log('\n6. Cleaning up...\n');
  connections.forEach((ws) => ws.close());

  console.log('\n=== Demo Complete ===');
  process.exit(0);
}

main().catch((error) => {
  console.error('Demo failed:', error);
  process.exit(1);
});
