
### 2. Order Submission
```bash
curl -X POST http://localhost:3000/api/orders/execute \
  -H "Content-Type: application/json" \
  -H "x-user-id: 1" \
  -d '{"type":"market","tokenIn":"SOL","tokenOut":"USDC","amountIn":1.5}'
```
**Expected:** Returns `orderId` and `status: "pending"`

### 3. WebSocket Status Updates
```bash
# First, submit an order to get orderId
ORDER_ID=$(curl -s -X POST http://localhost:3000/api/orders/execute \
  -H "Content-Type: application/json" \
  -H "x-user-id: 1" \
  -d '{"type":"market","tokenIn":"SOL","tokenOut":"USDC","amountIn":1.5}' \
  | jq -r '.orderId')

# Then connect via WebSocket (requires ws client)
node test-websocket.js $ORDER_ID
```
**Expected:** See status updates: `pending → routing → building → submitted → confirmed`

### 4. Multiple Orders Simultaneously
```bash
# Submit 3 orders at once
for i in {1..3}; do
  curl -X POST http://localhost:3000/api/orders/execute \
    -H "Content-Type: application/json" \
    -H "x-user-id: 1" \
    -d "{\"type\":\"market\",\"tokenIn\":\"SOL\",\"tokenOut\":\"USDC\",\"amountIn\":$((i+1))}"
done
```
**Expected:** All orders queued and processed

### 5. Queue Statistics
```bash
curl http://localhost:3000/api/queue/stats
```
**Expected:** Shows `waiting`, `active`, `completed`, `failed` counts

### 6. DEX Routing Verification
```bash
# Check orders to see which DEX was selected
curl http://localhost:3000/api/orders?userId=1&limit=10 | jq '.orders[] | {orderId, dex, executedPrice}'
```
**Expected:** Orders show `dex: "raydium"` or `dex: "meteora"` (best price selected)

### 7. Order History
```bash
curl http://localhost:3000/api/orders?userId=1&limit=10
```
**Expected:** Returns array of orders with full details including `txHash`, `executedPrice`

## 🧪 Comprehensive Test Script

Run the automated test script:
```bash
cd apps/backend
./test-api.sh
```

## 📊 Requirements Verification

### ✅ Order Types
- **Market Orders**: ✅ Implemented and working
- **Limit Orders**: ⚠️ Architecture supports, not yet implemented
- **Sniper Orders**: ⚠️ Architecture supports, not yet implemented

### ✅ DEX Routing
- ✅ Fetches quotes from both Raydium and Meteora
- ✅ Compares prices and selects best execution venue
- ✅ Logs routing decisions (check server console)
- ✅ Handles wrapped SOL (architecture ready)

### ✅ WebSocket Status Updates
- ✅ HTTP → WebSocket upgrade pattern
- ✅ Status flow: `pending → routing → building → submitted → confirmed/failed`
- ✅ Real-time updates via WebSocket

### ✅ Queue Management
- ✅ Up to 10 concurrent orders
- ✅ 100 orders/minute rate limit
- ✅ Queue statistics endpoint

### ✅ Retry Logic
- ✅ Exponential backoff (1s, 2s, 4s)
- ✅ Max 3 retry attempts
- ✅ Failed orders persisted with error messages

### ✅ Database Persistence
- ✅ PostgreSQL for order history
- ✅ Redis for active orders and pub/sub

## 🔍 Server Logs

Check the server console for:
- `[Order <id>] Best quote: raydium/meteora - Price: X, Amount Out: Y`
- `[Order <id>] Confirmed - TX: <hash>, Price: X`
- `[Queue] Job <id> completed`

## 📝 Postman Collection

Import `postman_collection.json` into Postman or Insomnia for GUI testing.

## 🎥 Video Demo Checklist

For your YouTube video, demonstrate:
1. ✅ Submit order via POST /api/orders/execute
2. ✅ Connect to WebSocket and show status updates
3. ✅ Submit 3-5 orders simultaneously
4. ✅ Show WebSocket updates for all orders
5. ✅ Check queue stats showing concurrent processing
6. ✅ Show DEX routing decisions in server logs
7. ✅ Verify orders in database via GET /api/orders

## 🐛 Troubleshooting

**Server won't start:**
- Check Redis is running: `docker ps | grep redis`
- Check PostgreSQL is running: `docker ps | grep postgres`

**Orders stuck in pending:**
- Check queue stats: `curl http://localhost:3000/api/queue/stats`
- Check server logs for errors

**WebSocket not connecting:**
- Verify orderId is correct
- Check server logs for WebSocket errors
- Ensure WebSocket route is accessible

