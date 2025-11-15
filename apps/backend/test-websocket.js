#!/usr/bin/env node

/**
 * Simple WebSocket test client for order status updates
 * Usage: node test-websocket.js <orderId>
 */

import WebSocket from 'ws';

const orderId = process.argv[2];

if (!orderId) {
  console.error('Usage: node test-websocket.js <orderId>');
  process.exit(1);
}

const ws = new WebSocket(`ws://localhost:3000/api/orders/${orderId}/status`);

ws.on('open', () => {
  console.log(`✅ Connected to WebSocket for order ${orderId}`);
  console.log('Waiting for status updates...\n');
});

ws.on('message', (data) => {
  const update = JSON.parse(data.toString());
  console.log('📨 Status Update:', JSON.stringify(update, null, 2));
  
  if (update.status === 'confirmed' || update.status === 'failed') {
    console.log('\n✅ Order processing complete!');
    ws.close();
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
  console.log('\n🔌 WebSocket connection closed');
  process.exit(0);
});

// Keep process alive
setTimeout(() => {
  console.log('\n⏱️  Timeout reached, closing connection');
  ws.close();
}, 30000); // 30 second timeout

