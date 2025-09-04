import express  = require("express")
import jwt = require("jsonwebtoken")
const { Pool } = require("pg")
import bycrypt  = require("bcrypt")
import Redis = require("ioredis")
const app = express()
app.use(express.json())



//@ts-ignore
const redis = new Redis({
    host:"127.0.0.1",
    port:6380
})


//@ts-ignore
const redis1 = new Redis({
    host:"127.0.0.1",
    port:6380
})


//@ts-ignore
const redis2 = new Redis({
    host:"127.0.0.1",
    port:6380
})


redis1.subscribe("placed")
//@ts-ignore
const pool = new Pool({
  host: "127.0.0.1",
  port: 5432,
  user: "postgres",
  password: "alan",
  database: "postgres"
});


function auth(req:any,res:any,next:any){
    const authheader = req.headers("authorization")
    const token  =  authheader.split(" ")[1];
    const decoded  = jwt.verify(token,"secretkey") as {id:number,username:string}
    req.user = decoded
    next();
}

app.post("/api/v1/signup",async(req,res)=>{
    const{username,password} = req.body
    try{
        const hashed = await bycrypt.hash(password,10);
        const hey = await pool.query("SELECT * from users where username = $1",[username]);
        if(hey.rows.length===0){
                await pool.query("insert into users(username,password,balance)values($1,$2,$3)",[username,hashed,10000])
        }
        return res.status(200).json({message:"signed up successfully"})
    }
    catch(err){
        return res.status(401).json({message:"there was some issue"})
    }
});

app.post("/api/v1/signin",async(req,res)=>{
    const{username,password}  = req.body
    try{
        const rows  = await pool.query("SELECT * from users where username = $1",username);
        const user  =  rows.rows[0]
        const match = bycrypt.compare(password,user.password)
        if(!match){
            return res.status(401).json({message:"The password is incorrect"})
        }
        const token  = jwt.sign({id:user.id,username:user.username},"secretkey",{expiresIn:"1h"});
        return res.json({token,username:user.username,balance:user.balance})
    }catch(err){
        return res.status(401).json({message:"there was some issue while signin up"})
    }
});

app.post("/api1/v1/trade/create",async(req:any,res:any)=>{
    try{
        const orderData = {
            ...req.body,
            userId:req.user.id
        }
await redis.xadd("placeorder","*","data",JSON.stringify(orderData))
//@ts-ignore
redis1.once("message",(channel,message)=>{
    return res.status(200).json(message)
})

setTimeout(() => {
    res.status(408).json({ message: "there was some  issue while processing the order" })
}, 10000)
    }catch(err){
        return res.status(401).json({message:"there was some issue"})
    }
})




app.post("/api1/v1/trade/close",async(req:any,res:any)=>{
    // const orderId  = req.boy;
    try{

        const closeData = {
            orderId:req.body.orderId,
            userId:req.user.id
        }
        await redis.xadd("closeorder","*","orderid",JSON.stringify(closeData))
        //@ts-ignore
        redis1.once("message", (channel, message) => {
                return res.status(200).json(JSON.parse(message));
            });
            setTimeout(() => {
                        res.status(408).json({ message: "there was some  issue while processing you close order request" })
            }, 10000)
    }catch(err){
        return res.status(401).json({message:"there was some issue"})
    }    
});

app.get("/api1/v1/balance",async(req:any,res:any)=>{
    const user = req.user;

     
});

app.get("/api1/v1/balance/usd",async(req:any,res:any)=>{
    try {
        const user = req.user;
        const result = await pool.query("SELECT balance FROM users WHERE id = $1", [user.id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "user not found" })
        }
        return res.json({ balance: result.rows[0].balance })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ message: "there was some issue while fetching the balance" })
    }
});


app.get("/api1/v1/suppotedAssets/",async(req:any,res:any)=>{
    const user = req.user;
    
});

app.listen(3000,()=>{
    console.log("im listening")
});