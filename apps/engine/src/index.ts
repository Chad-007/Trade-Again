import Redis = require("ioredis");
import uuid = require("uuid");
const { Pool } = require("pg");
//@ts-ignore
const redis = new Redis({
  host: "127.0.0.1",
  port: 6380,
});

const pool = new Pool({
  host: "127.0.0.1",
  port: 5433,
  user: "postgres",
  password: "alan",
  database: "postgres",
});

const Orders: Record<string, any> = {};
const latest: Record<
  string,
  { asset: string; price: Number; decimal: number }
> = {};

//@ts-ignore
const redis3 = new Redis({
  host: "127.0.0.1",
  port: 6380,
});

//@ts-ignore
const redis1 = new Redis({
  host: "127.0.0.1",
  port: 6380,
});

//@ts-ignore
const redis2 = new Redis({
  host: "127.0.0.1",
  port: 6380,
});

redis2.subscribe("trades");
//@ts-ignore
redis2.on("message", async (channel, data) => {
  const parsed = JSON.parse(data);
  const updates = parsed.price_updates;
  for (const update of updates) {
    latest[update.asset] = {
      asset: update.asset,
      price: update.price,
      decimal: update.decimal,
    };
  }
  // console.log(latest)
});


let balance:number = 100000000000;

function waitForPrice(asset: string): Promise<any> {
  return new Promise((resolve) => {
    const check = setInterval(() => {
      if (latest[asset]) {
        clearInterval(check);
        resolve(latest[asset]);
      }
      console.log(Orders);
    }, 100);
  });
}

async function restoreorders() {
  const all = await redis3.hgetall("open_orders");
  for (const [id, data] of Object.entries(all)) {
    Orders[id] = JSON.parse(data as string);
  }
  console.log("restored open orders:", Object.keys(Orders).length);
}


// IMP::::::: i dont think we need to restore prices cause we are cahing the openorders with respct to the prices that was at that time
// async function restoreprices() {
//   const all = await redis3.hgetall("prices");
//   for (const [id, data] of Object.entries(all)) {
//     latest[id] = JSON.parse(data as string);
//   }
//   console.log("restored prices:", Object.keys(latest).length);
// }

async function engine() {
  let lastId = (await redis3.get("placeorder:last_id")) || "0";

  while (true) {
    const stream = await redis.xread(
      "BLOCK",
      0,
      "STREAMS",
      "placeorder",
      lastId
    );
    if (!stream) continue;

    const [name, messages] = stream[0] as any;

    for (const [id, fields] of messages) {
      try {
        const rawdata = fields[1];
        const raw = JSON.parse(rawdata);
        const orderid = uuid.v4();
        // wait if not price is there mostly wont be needed
        const market = latest[raw.asset] || (await waitForPrice(raw.asset));
        const price = market.price;
        const position = {
          id: orderid,
          asset: raw.asset,
          side: raw.type,
          entryprice: price,
          margin: raw.margin,
          leverage: raw.leverage,
          size: (raw.margin * raw.leverage) / price,
          liquidationPrice:
            raw.type === "long"
              ? price * (1 - 1 / raw.leverage)
              : price * (1 + 1 / raw.leverage),
        };
        balance -= raw.margin*raw.leverage;
        Orders[orderid] = position;
        //snapshot  at a spot rather than one by one
        await redis3.multi().hset("prices", raw.asset, JSON.stringify({
                asset: market.asset,
                price: market.price,
                decimal: market.decimal,
                })).hset("open_orders", orderid, JSON.stringify(position)).exec();
        await redis1.publish("placed", JSON.stringify(orderid));
      } catch (err) {
        console.error("processing error:", err);
      } finally {
        lastId = id;
        await redis3.set("placeorder:last_id", lastId);
      }
    }
  }
}
async function closeengine() {
  // to prevent reprocessing  ie give me all the messages after lastid
  let lastId = (await redis3.get("closeorder:last_id")) || "0";
  while (true) {
    const stream = await redis.xread("BLOCK", 0, "STREAMS", "closeorder", lastId);
    if (!stream) continue;
    const [name, messages] = stream[0] as any;
    for (const [id, fields] of messages) {
      try {
        const rawdata = fields[1];
        const raw = JSON.parse(rawdata);
        const orderid = raw.orderId;
        const userid = raw.userId;
        const anyorder = Orders[orderid];
        if (!anyorder) {
          console.error("Order not found in open_orders:", orderid);
          continue;
        }
        const currorder = JSON.parse(anyorder);
        const market = latest[currorder.asset] || await waitForPrice(currorder.asset);
        const exitprice = market.price;
        const pnl = currorder.side === "long"
          ? (exitprice - currorder.entryprice) * currorder.size
          : (currorder.entryprice - exitprice) * currorder.size;
        const closedOrder = {
          ...currorder,
          exitprice,
          pnl,
          closedAt: new Date().toISOString(),
        };
        balance +=pnl
        console.log("the you this much money left brotha",balance)
        await redis3.hdel("open_orders", orderid);
        await redis1.publish("placed", JSON.stringify({ status: "closed", orderid }));
        await pool.query(
          `INSERT INTO closed_orders
           (id, userid, asset, side, margin, leverage, entryprice, exitprice, pnl, order_size, closed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            orderid,
            userid,
            closedOrder.asset,
            closedOrder.side,
            closedOrder.margin,
            closedOrder.leverage,
            closedOrder.entryprice,
            closedOrder.exitprice,
            closedOrder.pnl,
            closedOrder.size,
            closedOrder.closedAt,
          ]
        );
        console.log("closed order:", closedOrder);
      } catch (err) {
        console.error("processing error:", err);
      } finally {
        lastId = id;
        await redis3.set("closeorder:last_id", lastId);
      }
    }
  }
}


async function bootstrap() {
  await restoreorders();
  // await restoreprices();
  engine();
  closeengine();
}

bootstrap();
