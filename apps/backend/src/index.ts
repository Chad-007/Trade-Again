import express = require("express");
import jwt = require("jsonwebtoken");
import bcrypt = require("bcrypt");
import Redis = require("ioredis");
//@ts-ignore
import { v4 as uuidv4 } from "uuid";
const { Pool } = require("pg");



// new logic
//callback logic for easier error return
class RedisSubscriber {
    //@ts-ignore
    private client: Redis;
    private callbacks: Record<string, (value: any) => void>;
    constructor() {
      //@ts-ignore
        this.client = new Redis({ host: "127.0.0.1", port: 6380 });
        this.callbacks = {};
        this.runloop();
    }

    async runloop() {
        let lastId = "$";
        while (true) {
            const response = await this.client.xread("BLOCK", 0, "STREAMS", "callback_stream", lastId);
            // console.log("this  was the reponse",response.assetbalance)
            if (!response) continue;
            const [stream, messages] = response[0] as any;
            for (const [messageId, fields] of messages) {
              //gets the payload to resolve the promise
                const payload = JSON.parse(fields[1]);
                console.log("this was the response payload:", payload); 
                if (this.callbacks[payload.requestId]) {
                  //@ts-ignore
                  // resolve the promise and deletes it :)) next level shit..  ::::
                    this.callbacks[payload.requestId](payload);
                    delete this.callbacks[payload.requestId];
                }
                lastId = messageId;
                console.log(lastId)
            }
        }
    }

    public waitForMessage(requestId: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.callbacks[requestId] = resolve;
            setTimeout(() => {
                if (this.callbacks[requestId]) {
                    delete this.callbacks[requestId];
                    reject(new Error("Request timed out"));
                }
            }, 10000);
        });
    }
}

const app = express();
app.use(express.json());
//@ts-ignore
const redisClient = new Redis({ host: "127.0.0.1", port: 6380 });
const redisSubscriber = new RedisSubscriber();

const pool = new Pool({
  host: "127.0.0.1",
  port: 5433,
  user: "postgres",
  password: "alan",
  database: "postgres",
});

function auth(req: any, res: any, next: any) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });
  try {
    req.user = jwt.verify(token, "secretkey");
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

app.post("/api/v1/signup", async (req, res) => {
  const { username, password } = req.body;
  try {
    const existingUser = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "user exists" });
    }
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users(username, password, balance) VALUES($1, $2, $3) RETURNING id",
      [username, hashed, 100000.0]
    );
    const userid = result.rows[0].id;
    const token = jwt.sign({ userid }, "secretkey", { expiresIn: "1h" });
    const magicLink = `http://localhost:3000/api/v1/magic/${token}`;
    return res.status(200).json({ message: "Signed up successfully", token, userid, magicLink });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ message: "server error" });
  }
});

app.post("/api/v1/signin", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "user not found" });
    }
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Incorrect password" });
    }
    const token = jwt.sign({ userid: user.id }, "secretkey", { expiresIn: "1h" });
    const magicLink = `http://localhost:3000/api/v1/magic/${token}`;
    return res.json({ message: "Logged in successfully", token, userid: user.id, magicLink });
  } catch (err) {
    console.error("Signin error:", err);
    return res.status(500).json({ message: "server error" });
  }
});

app.get("/api/v1/magic/:token", async (req, res) => {
    try {
        const { token } = req.params;
        const decoded = jwt.verify(token, "secretkey") as { userid: number };
        const result = await pool.query("SELECT balance FROM users WHERE id = $1", [decoded.userid]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "user not found" });
        }
        const balance = result.rows[0].balance;
        const command = { type: 'UPDATE_BALANCE', payload: { userid: decoded.userid, balance } };
        await redisClient.xadd("command_stream", "*", "data", JSON.stringify(command));
        
        return res.status(200).json({ message: "balance initlialized" });
    } catch (err) {
        console.error("Magic link error:", err);
        return res.status(500).json({ message: "invalid token" });
    }
});

app.post("/api/v1/trade/create", auth, async (req: any, res: any) => {
  const requestId = uuidv4();
  try {
    // send both the payload and the type
    const command = {
      type: 'CREATE_ORDER',
      payload: { ...req.body, userId: req.user.userid, requestId }
    };
    await redisClient.xadd("command_stream", "*", "data", JSON.stringify(command));
    const response = await redisSubscriber.waitForMessage(requestId);
    if (response.status === "placed") {
      res.status(200).json({ message: "order placed", orderId: response.orderId });
    } else {
      res.status(400).json({ message: "failed to palce order", reason: response.status });
    }
  } catch (err) {
    res.status(500).json({ message: "time out" });
  }
});

app.post("/api/v1/trade/close", auth, async (req: any, res: any) => {
  const requestId = uuidv4();
  try {
    // send both the payload and the type
    const command = {
      type: 'CLOSE_ORDER',
      payload: { ...req.body, userId: req.user.userid, requestId }
    };
    await redisClient.xadd("command_stream", "*", "data", JSON.stringify(command));
    const response = await redisSubscriber.waitForMessage(requestId);
    if (response.status === "closed") { 
      res.status(200).json({ message: "order closed", pnl: response.pnl });
    } else {
      res.status(400).json({ message: "order wasnt closed", reason: response.status });
    }
  } catch (err) {
    res.status(500).json({ message: "time out" });
  }
});

app.get("/api/v1/balance", auth, async (req: any, res: any) => {
    const requestId = uuidv4();
    try {
        // send both the payload and the type
        const command = {
            type: 'GET_BALANCE',
            payload: { userId: req.user.userid, requestId }
        };
        await redisClient.xadd("command_stream", "*", "data", JSON.stringify(command));
        const response = await redisSubscriber.waitForMessage(requestId);
        res.status(200).json({ 
            // balance: response.balance,
            assetBalance: response.assetBalance || {}
        });
    } catch (err) {
        res.status(500).json({ message: "there was some issue with getting the balance" });
    }
});


app.get("/api/v1/balance/usd", auth, async (req: any, res: any) => {
    const requestId = uuidv4();
    try {
        // send both the payload and the type
        const command = {
            type: 'GET_BALANCE',
            payload: { userId: req.user.userid, requestId }
        };
        await redisClient.xadd("command_stream", "*", "data", JSON.stringify(command));
        const response = await redisSubscriber.waitForMessage(requestId);
        res.status(200).json({ 
            balance: response.balance
            // assetBalance: response.assetBalance || {}
        });
    } catch (err) {
        res.status(500).json({ message: "there was some issue with getting the balance" });
    }
});

app.get("/api/v1/assets", auth, async (req: any, res: any) => {
  return res.json({
    assets: [
      { symbol: "BTC", name: "Bitcoin" },
      { symbol: "ETH", name: "Ethereum" },
      { symbol: "SOL", name: "Solana" },
    ],
  });
});

app.listen(3000);