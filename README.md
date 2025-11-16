# Order Execution Engine

A high-performance order execution engine with DEX routing (Raydium & Meteora) and real-time WebSocket status updates.

## 🎯 Overview

This order execution engine processes market orders with intelligent DEX routing, comparing prices from multiple DEXs and automatically selecting the best execution venue. It features:

- **Market Order Execution** - Immediate execution at current market price
- **DEX Routing** - Automatic price comparison between Raydium and Meteora
- **Real-time Updates** - WebSocket streaming of order lifecycle
- **Queue Management** - Handles up to 10 concurrent orders, 100 orders/minute
- **Retry Logic** - Exponential backoff with up to 3 retry attempts
- **Order History** - PostgreSQL persistence for all orders


live link:https://trade-again.onrender.com
replace localhost with the live link

## 🏗️ Architecture

### Order Flow

```
1. POST /api/orders/execute
   ↓
2. Order queued (status: "pending")
   ↓
3. DEX routing (status: "routing")
   - Fetch quotes from Raydium & Meteora
   - Select best price
   ↓
4. Transaction building (status: "building")
   ↓
5. Transaction submitted (status: "submitted")
   ↓
6. Execution with retry logic
   ↓
7. Confirmed (status: "confirmed") or Failed (status: "failed")
```


IMP:
ADDED 10 seconds delay TO PROPERLY SEE ALL THE STATUS OF THE ORDERS VIA THE WEBSOCKET
remove the sleep in worker publish to see the proper execution

### Components

- **MockDexRouter** - Simulates Raydium and Meteora DEX interactions with realistic delays and price variations
- **OrderProcessor** - Handles order execution with retry logic and status updates
- **OrderQueue** - BullMQ-based queue with concurrency limits (10 concurrent, 100/min)
- **WebSocketManager** - Real-time status broadcasting via Redis pub/sub
- **Database** - PostgreSQL for order persistence

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18
- PostgreSQL (running on port 5433)
- Redis (running on port 6379)

### Installation

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run server
npm run dev
```

### Database Setup

The database schema is automatically created on server startup. Ensure PostgreSQL is running and accessible.

## 📡 API Endpoints

### POST /api/orders/execute

Submit a market order for execution.

**Request:**
```json
{
  "type": "market",
  "tokenIn": "SOL",
  "tokenOut": "USDC",
  "amountIn": 1.5
}
```

**Response:**
```json
{
  "orderId": "uuid",
  "status": "pending",
  "message": "Order queued for execution. Connect to WebSocket at /api/orders/{orderId}/status for live updates",
  "websocketUrl": "/api/orders/{orderId}/status"
}
```

### GET /api/orders/:orderId

Get order details by ID.

**Response:**
```json
{
  "orderId": "uuid",
  "userId": 1,
  "type": "market",
  "tokenIn": "SOL",
  "tokenOut": "USDC",
  "amountIn": 1.5,
  "amountOut": 149.55,
  "status": "confirmed",
  "dex": "raydium",
  "txHash": "abc123...",
  "executedPrice": 99.7,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:05.000Z"
}
```

### GET /api/orders

Get orders for a user (optional `userId` query param, or use `x-user-id` header).

### GET /api/queue/stats

Get queue statistics.

**Response:**
```json
{
  "waiting": 5,
  "active": 2,
  "completed": 100,
  "failed": 3,
  "total": 110
}
```

### WebSocket: ws:/api/ws/:userId
Connect to WebSocket after submitting an order to receive real-time status updates.

**Status Flow:**
- `pending` - Order received and queued
- `routing` - Comparing DEX prices
- `building` - Creating transaction
- `submitted` - Transaction sent to network
- `confirmed` - Transaction successful (includes `txHash`, `executedPrice`)
- `failed` - Execution failed (includes `error`)

**Example Message:**
```json
{
  "orderId": "uuid",
  "status": "routing",
  "dex": "raydium",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

The test suite includes:
- **Unit Tests** - MockDexRouter, OrderProcessor, Queue, Database
- **Integration Tests** - Complete order execution flow

## 📦 Postman Collection

Import `postman_collection.json` into Postman or Insomnia for easy API testing.

**Variables:**
- `base_url` - Set to `localhost:3000` (or your server URL)

## 🎨 Design Decisions

### Why Market Orders?

Market orders were chosen as the initial implementation because:
1. **Simplicity** - No price monitoring or conditional logic required
2. **Immediate Execution** - Best for demonstrating DEX routing and execution flow
3. **Foundation** - Provides the base architecture for extending to limit and sniper orders

### Extending to Other Order Types

The engine can be extended to support **limit** and **sniper** orders:

**Limit Orders:**
- Add price monitoring in the `OrderProcessor`
- Check current price against `limitPrice` before execution
- Queue limit orders separately and process when price condition is met

**Sniper Orders:**
- Add token launch detection logic
- Monitor new token pairs on DEXs
- Execute immediately when target token becomes available

The current architecture (queue system, DEX router, WebSocket updates) supports these extensions without major refactoring.

### Mock vs Real DEX Integration

This implementation uses **mock DEX routing** to:
- Focus on architecture and flow
- Avoid Solana devnet complexity during development
- Enable reliable testing without network dependencies

To switch to **real DEX execution**:
1. Replace `MockDexRouter` with real SDK implementations
2. Use `@raydium-io/raydium-sdk-v2` and `@meteora-ag/dynamic-amm-sdk`
3. Handle wrapped SOL for native token swaps
4. Add proper error handling for network failures

## 🔧 Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Fastify (with WebSocket support)
- **Queue:** BullMQ + Redis
- **Database:** PostgreSQL
- **Real-time:** WebSocket + Redis pub/sub

## 📊 Performance

- **Concurrency:** Up to 10 concurrent orders
- **Throughput:** 100 orders/minute
- **Retry Logic:** Exponential backoff (1s, 2s, 4s) with max 3 attempts
- **DEX Routing:** Concurrent quote fetching (~200ms per DEX)

## 🐛 Error Handling

- Automatic retry with exponential backoff (3 attempts max)
- Failed orders persisted with error messages
- WebSocket broadcasts failure status
- Queue statistics track failed orders

## 📝 License

MIT

## 🔗 Resources

- [Fastify Documentation](https://www.fastify.io/)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Raydium SDK](https://github.com/raydium-io/raydium-sdk-V2-demo)
- [Meteora Documentation](https://docs.meteora.ag/)

