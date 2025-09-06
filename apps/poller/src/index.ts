import WebSocket = require("ws");
import Redis = require("ioredis");

// Redis client
//@ts-ignore
const redis = new Redis({
  host: "127.0.0.1",
  port: 6380,
});

// WebSocket connection
const ws = new WebSocket("wss://ws.backpack.exchange/");

// Latest prices store
const latest: Record<string, { asset: string; price: number; decimal: number }> = {};

// Hardcoded decimal mapping per asset
const decimals: Record<string, number> = {
  SOL: 6,
  ETH: 6,
  BTC: 4,
};

ws.on("open", () => {
  console.log("WebSocket connected");
  ws.send(
    JSON.stringify({
      method: "SUBSCRIBE",
      params: ["bookTicker.SOL_USDC", "bookTicker.BTC_USDC", "bookTicker.ETH_USDC"],
    })
  );
});

ws.on("message", (msg) => {
  const data = JSON.parse(msg.toString()).data;

  if (data && data.s && data.a) {
    const [asset, quote] = data.s.split("_");

    latest[asset] = {
      asset,
      //@ts-ignore
      price: parseInt(data.a) * 10 ** decimals[asset], 
      //@ts-ignore
      decimal: decimals[asset],
    };
  }
});

setInterval(() => {
  const updates = Object.values(latest);
  const payload = { price_updates: updates };

  // publish to Redis pub/sub
  redis.publish("trades", JSON.stringify(payload));
  console.log("published", payload);
}, 1000);
