import WebSocket = require("ws")
import Redis = require("ioredis")

//@ts-ignore
const redis = new Redis({
    host:"127.0.0.1",
    port:6380
})


const ws = new WebSocket("wss://ws.backpack.exchange/")
const latest:Record<string,{asset:string,price:Number,decimal:number}> = {}


ws.on("open",()=>{
    ws.send(JSON.stringify({method:"SUBSCRIBE",params:["trade.SOL_USDC"]}))
    ws.send(JSON.stringify({method:"SUBSCRIBE",params:["trade.BTC_USDC"]}))
    ws.send(JSON.stringify({method:"SUBSCRIBE",params:["trade.ETH_USDC"]}))
})


ws.on("message",async(trade)=>{
    const what = JSON.parse(trade.toString())
    if(what.data.s && what.data.p){
        const [asset,quote] = what.data.s.split("_");
        latest[asset] = {
            asset,
            price:Number(what.data.p),
            decimal:Number(what.data.q)
        }
    }
})


setInterval(()=>{
    const updates = Object.values(latest);
    const payload = {price_updates:updates}
    redis.publish("trades",JSON.stringify(payload))
    console.log("published",payload)
},1000)