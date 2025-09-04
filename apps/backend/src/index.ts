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
    const authheader = req.headers("Authorization")
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
                await pool.query("insert into users(username,password,balance)values($1,$2)",[username,hashed,10000])
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
    // const {asset,type,margin,leverage,slippage} = req.body
    try{
        await redis.xadd("placeorder","*","data",JSON.stringify(req.body))
        //@ts-ignore
        redis1.once("message",(channel,message)=>{
        return res.status(200).json(message)
    })
    }catch(err){
        return res.status(401).json({message:"there was some issue"})
    }
})




app.post("/api1/v1/trade/close",async(req:any,res:any)=>{
    const user = req.user;
    
})

app.get("/api1/v1/balance/usd",async(req:any,res:any)=>{
    const user = req.user;
    
})

app.get("/api1/v1/balance/",async(req:any,res:any)=>{
    const user = req.user;
    
})

app.get("/api1/v1/suppotedAssets/",async(req:any,res:any)=>{
    const user = req.user;
    
})

app.listen(3000,()=>{
    console.log("im listening")
})