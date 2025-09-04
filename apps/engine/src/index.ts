import Redis = require("ioredis");
import parse = require("uuid");
import uuid = require("uuid")

//@ts-ignore
const redis = new Redis({
    host:"127.0.0.1",
    port:6380
})

const Orders:Record<string,any> = {}
const latest:Record<string,{asset:string,price:Number,decimal:number}> = {}

//@ts-ignore
const redis3 = new Redis({
    host:"127.0.0.1",
    port:6380
})

//@ts-ignore
const redis1 = new Redis({
    host:"127.0.0.1",
    port:6380
})

//@ts-ignore
const redis2  = new Redis({
    host:"127.0.0.1",
    port:6380
})


//@ts-ignore
const redis4 = new Redis({
    host:"127.0.0.1",
    port:6380
})



redis2.subscribe("trades");
//@ts-ignore
redis2.on("message",async(channel,data)=>{
    const parsed  = JSON.parse(data)
    const updates = parsed.price_updates
    for(const update of updates){
        latest[update.asset] = {
            asset:update.asset,
            price:update.price,
            decimal:update.decimal
        }
    }
    console.log(latest)
});



function waitForPrice(asset: string): Promise<any> {
    return new Promise((resolve) => {
        const check = setInterval(() => {
            if (latest[asset]) {
                clearInterval(check);
                resolve(latest[asset]);
            }
        console.log(Orders)
        }, 100); 
    });
}



async function engine(){
    while(true){
        const stream = await redis.xread('BLOCK', 0, 'STREAMS', 'placeorder', '$');
        //@ts-ignore
        if(!stream){
            continue;
        }
        const Orders = await redis3.hgetall("open_orders");
            for (const [id, data] of Object.entries(Orders)) {
                Orders[id] = JSON.parse(data as string);
            }
        const [name,message] = stream[0] as any;
        for(const[id,data] of  message){
            const [order,rawdata] = data;
            const raw = JSON.parse(rawdata);
            const orderid  = uuid.v4()
            Orders[orderid] = raw
            console.log("before :))",Orders)
            const market = latest[raw.asset] || await waitForPrice(raw.asset);
            const price = market.price
            const pos = market/raw.margin
            const position = {
                id: orderid,
                asset: raw.asset,
                side: raw.type,
                entryprice: price,
                margin: raw.margin,
                leverage: raw.leverage,
                size: pos,
                liquidationPrice: raw.type === "long"
                    ? price - (raw.margin / pos) * price
                    : price + (raw.margin / pos) * price
            };
            Orders[orderid] = position
            console.log("after :))",Orders)
            await redis3.hset("open_orders", orderid, JSON.stringify(position));
            await redis1.publish("placed",JSON.stringify("hey"))
        }
    }
}

async function closeengine(){
    while(true){
        const stream = await redis.xread('BLOCK', 0, 'STREAMS', 'closeorder', '$');
        if (!stream) continue;

        const [name, message] = stream[0] as any;
        for(const[id,data] of message){
            const [order,rawdata] = data;
            const raw = JSON.parse(rawdata);
            const orderid = raw.orderId;
            const anyorder = await redis3.hget("open_orders", orderid);
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

            await redis3.hdel("open_orders", orderid);
            await redis1.publish("placed", JSON.stringify({ status: "closed", orderid: orderid }));
            console.log("closed order:", closedOrder);
        }
    }   
}



engine()
closeengine()


