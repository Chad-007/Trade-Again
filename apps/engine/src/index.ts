import Redis = require("ioredis");
import uuid = require("uuid")
//@ts-ignore
const redis = new Redis({
    host:"127.0.0.1",
    port:6380
})


const Orders:Record<string,any> = {}
const latest:Record<string,{asset:string,price:Number,decimal:number}> = {}


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


redis2.subscribe("trades");
//@ts-ignore
redis2.on("message",async(channel,data)=>{
    console.log(data)
})


async function engine(){
    while(true){
        const stream = await redis.xread('BLOCK', 0, 'STREAMS', 'placeorder', '$');
        
        if(!stream){
            continue;
        }
        const [name,message] = stream[0] as any;
        for(const[id,data] of  message){
            const [order,rawdata] = data;
            const raw = JSON.parse(rawdata);
            const orderid  = uuid.v4()
            Orders[orderid] = raw
            console.log(Orders)
            await redis1.publish("placed",JSON.stringify("hey"))
        }
    }
}
engine()
