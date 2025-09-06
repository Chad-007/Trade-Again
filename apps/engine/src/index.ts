import Redis = require("ioredis");
//@ts-ignore
import { v4 as uuidv4 } from "uuid";
const { Pool } = require("pg");

//@ts-ignore
const reader = new Redis({ host: "127.0.0.1", port: 6380 });
//@ts-ignore
const writer = new Redis({ host: "127.0.0.1", port: 6380 });
//@ts-ignore
const subscriber = new Redis({ host: "127.0.0.1", port: 6380 });

const pool = new Pool({
  host: "127.0.0.1",
  port: 5433,
  user: "postgres",
  password: "alan",
  database: "postgres",
});

let balances: Record<string, number> = {};
const Orders: Record<string, any> = {};
const latest: Record<string, { asset: string; price: number; decimal: number }> = {};

async function subtotrades() {
  subscriber.subscribe("trades");
  //@ts-ignore
  subscriber.on("message", (channel, data) => {
    if (channel === "trades") {
      const parsed = JSON.parse(data);
      const updates = parsed.price_updates;
      for (const update of updates) {
        latest[update.asset] = {
          asset: update.asset,
          price: update.price,
          decimal: update.decimal,
        };
      }
    }
  });
}

function waiterforprice(asset: string): Promise<any> {
  return new Promise((resolve) => {
    const check = setInterval(() => {
      if (latest[asset]) {
        clearInterval(check);
        resolve(latest[asset]);
      }
    }, 100);
  });
}

async function restoreState() {
  const allorders = await writer.hgetall("open_orders");
  for (const [id, data] of Object.entries(allorders)) {
    Orders[id] = JSON.parse(data as string);
  }
  console.log("restored the  open orders:", Object.keys(Orders).length);

  const userbalances = await pool.query("SELECT id, balance FROM users");
  for (const user of userbalances.rows) {
      balances[user.id] = parseFloat(user.balance);
  }
  console.log("restored the  user balances:", Object.keys(balances).length);
}

async function processCreateOrder(payload: any) {
  const { requestId, userId, asset, type, margin, leverage } = payload;
  const market = latest[asset] || (await waiterforprice(asset));
  const price = market.price;
  
  if (balances[userId] != null && balances[userId] >= margin) {
    balances[userId] -= margin;
    const orderId = uuidv4();
    const position = {
      id: orderId,
      userId: userId,
      asset: asset,
      side: type,
      entryprice: price,
      margin: margin,
      leverage: leverage,
      size: (margin * leverage) / price,
      liquidationprice:
        type === "long"
          ? price * (1 - 1 / leverage)
          : price * (1 + 1 / leverage),
    };
    Orders[orderId] = position;
    await writer.hset("open_orders", orderId, JSON.stringify(position));
    await writer.xadd("callback_stream", "*", "data", JSON.stringify({ requestId, status: "placed", orderId }));
  } else {
    await writer.xadd("callback_stream", "*", "data", JSON.stringify({ requestId, status: "low balance" }));
  }
}

async function processCloseOrder(payload: any) {
    const { requestId, userId, orderId } = payload;
    const orderToClose = Orders[orderId];

    if (!orderToClose || orderToClose.userId !== userId) {
        await writer.xadd("callback_stream", "*", "data", JSON.stringify({ requestId, status: "not_found" }));
        return;
    }

    const market = latest[orderToClose.asset] || (await waiterforprice(orderToClose.asset));
    const exitprice = market.price;
    const pnl = orderToClose.side === "long"
        ? (exitprice - orderToClose.entryprice) * orderToClose.size
        : (orderToClose.entryprice - exitprice) * orderToClose.size;

    const newbalance = (balances[userId] || 0) + orderToClose.margin + pnl;
    balances[userId] = newbalance;

    const closedOrder = { ...orderToClose, exitprice, pnl, closedAt: new Date().toISOString() };
    delete Orders[orderId];
    
    await pool.query("UPDATE users SET balance = $1 WHERE id = $2", [newbalance, userId]);
    await writer.hdel("open_orders", orderId);

    await pool.query(
        `INSERT INTO closed_orders (id, userid, asset, side, margin, leverage, entryprice, exitprice, pnl, order_size, closed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [orderId, userId, closedOrder.asset, closedOrder.side, closedOrder.margin, closedOrder.leverage, closedOrder.entryprice, closedOrder.exitprice, pnl, closedOrder.size, closedOrder.closedAt]
    );
    
    await writer.xadd("callback_stream", "*", "data", JSON.stringify({ requestId, status: "closed", pnl }));
}

async function processUpdateBalance(payload: any) {
    const { userid, balance } = payload;
    balances[userid] = parseFloat(balance);
    console.log(`updated the balance for user ${userid}: ${balance}`);
}

async function processGetBalance(payload: any) {
    const { requestId, userId } = payload;
    const balance = balances[userId] || 0;
    await writer.xadd("callback_stream", "*", "data", JSON.stringify({ requestId, balance }));
}

async function engine() {
  let lastId = "$";
  while (true) {
    const stream = await reader.xread("BLOCK", 0, "STREAMS", "command_stream", lastId);
    if (!stream) continue;

    const [name, messages] = stream[0] as any;
    for (const [id, fields] of messages) {
      try {
        const message = JSON.parse(fields[1]);
        switch (message.type) {
          case 'CREATE_ORDER':
            await processCreateOrder(message.payload);
            break;
          case 'CLOSE_ORDER':
            await processCloseOrder(message.payload);
            break;
          case 'UPDATE_BALANCE':
            await processUpdateBalance(message.payload);
            break;
          case 'GET_BALANCE':
            await processGetBalance(message.payload);
            break;
        }
      } catch (err) {
        console.error("processing error:", err);
      } finally {
        lastId = id;
      }
    }
  }
}

async function start() {
  await subtotrades();
  await restoreState();
  engine();
  console.log("engine started");
}

start();