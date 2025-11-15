#!/bin/bash

# Comprehensive API Test Script for Order Execution Engine

echo "🧪 Testing Order Execution Engine"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3000"

echo -e "${BLUE}1. Health Check${NC}"
curl -s "$BASE_URL/health" | jq .
echo ""

echo -e "${BLUE}2. Submit Order${NC}"
ORDER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/orders/execute" \
  -H "Content-Type: application/json" \
  -H "x-user-id: 1" \
  -d '{"type":"market","tokenIn":"SOL","tokenOut":"USDC","amountIn":1.5}')

ORDER_ID=$(echo $ORDER_RESPONSE | jq -r '.orderId')
echo "$ORDER_RESPONSE" | jq .
echo ""

echo -e "${BLUE}3. Get Order Status${NC}"
sleep 1
curl -s "$BASE_URL/api/orders/$ORDER_ID" | jq .
echo ""

echo -e "${BLUE}4. Queue Statistics${NC}"
curl -s "$BASE_URL/api/queue/stats" | jq .
echo ""

echo -e "${BLUE}5. Submit 3 Orders Simultaneously${NC}"
for i in {1..3}; do
  echo "Submitting order $i..."
  curl -s -X POST "$BASE_URL/api/orders/execute" \
    -H "Content-Type: application/json" \
    -H "x-user-id: 1" \
    -d "{\"type\":\"market\",\"tokenIn\":\"SOL\",\"tokenOut\":\"USDC\",\"amountIn\":$((i+1))}" \
    | jq -r '.orderId'
done
echo ""

echo -e "${BLUE}6. Wait for processing (5 seconds)...${NC}"
sleep 5

echo -e "${BLUE}7. Get All Orders for User${NC}"
curl -s "$BASE_URL/api/orders?userId=1&limit=10" | jq '.orders | length as $count | "Total orders: \($count)"'
echo ""

echo -e "${BLUE}8. Check Order Details (showing DEX routing)${NC}"
curl -s "$BASE_URL/api/orders?userId=1&limit=5" | jq '.orders[] | {orderId, status, dex, executedPrice, txHash}'
echo ""

echo -e "${GREEN}✅ Testing Complete!${NC}"
echo ""
echo "To test WebSocket, run:"
echo "  node test-websocket.js $ORDER_ID"

