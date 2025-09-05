import express = require("express");
import jwt = require("jsonwebtoken");
const { Pool } = require("pg");
import bcrypt = require("bcrypt");
import Redis = require("ioredis");
const app = express();
app.use(express.json());

//@ts-ignore
const redis = new Redis({
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

redis1.subscribe("placed");
//@ts-ignore
const pool = new Pool({
  host: "127.0.0.1",
  port: 5433,
  user: "postgres",
  password: "alan",
  database: "postgres",
});

app.post("/api/v1/signup", async (req, res) => {
  const { username, password } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    const hey = await pool.query("SELECT * from users where username = $1", [
      username,
    ]);
    if (hey.rows.length === 0) {
      const result = await pool.query(
        "insert into users(username,password,balance)values($1,$2,$3) returning id,balance",
        [username, hashed, 100000000]
      );
      const userid = result.rows[0].id;
      const balance = result.rows[0].balance;
      const token = jwt.sign({ userid, balance }, "secretkey", {
        expiresIn: "1h",
      });
      const magiclink = `http://localhost:3000/api/v1/magic/${token}`;
      return res
        .status(200)
        .json({ message: "signed up successfully", magiclink, userid: userid });
    } else {
      return res.json({ message: "user already exists try logging in" });
    }
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(401).json({ message: "there was some issue" });
  }
});

app.post("/api/v1/signin", async (req, res) => {
  const { username, password } = req.body;
  try {
    const rows = await pool.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);
    if (rows.rows.length === 0) {
      return res.status(404).json({ message: "not found" });
    }
    const user = rows.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "incorrect" });
    }
    const userid = rows.rows[0].id;
    const balance = rows.rows[0].balance;
    const token = jwt.sign({ userid, balance }, "secretkey", {
      expiresIn: "1h",
    });
    const magiclink = `http://localhost:3000/api/v1/magic/${token}`;
    return res.json({
      message: "logged in successfully click the link now",
      magiclink,
      userid: userid,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "issue" });
  }
});

app.get("/api/v1/magic/:token", async (req, res) => {
  const { token } = req.params;
  console.log("hey", token);
  try {
    //@ts-ignore
    const decoded = jwt.verify(token, "secretkey") as unknown as {
      userid: number;
      balance: number;
    };
    await redis2.xadd("placebalance", "*", "data", JSON.stringify(decoded));
    // i dont think we need another validation here its just signin  right..
    return res.status(401).json({ message: "succes" });
  } catch (err) {
    return res
      .status(401)
      .json({ message: "there was some issue while using the magiclink" });
  }
});

app.post("/api1/v1/trade/create", async (req: any, res: any) => {
  const user = req.user;
  try {
    const orderData = {
      ...req.body,
      userId: 1,
    };
    await redis.xadd("placeorder", "*", "data", JSON.stringify(orderData));
    let responded = false;
    //@ts-ignore
    redis1.once("message", (channel, message) => {
      if (!responded) {
        responded = true;
        res.status(200).json(JSON.parse(message));
      }
    });
    setTimeout(() => {
      if (!responded) {
        responded = true;
        res
          .status(408)
          .json({ message: "there was some issue while processing the order" });
      }
    }, 10000);
  } catch (err) {
    return res.status(401).json({ message: "there was some issue" });
  }
});

app.post("/api1/v1/trade/close", async (req: any, res: any) => {
  try {
    const closeData = {
      orderId: req.body.orderId,
      userId: 1,
    };
    await redis.xadd("closeorder", "*", "orderid", JSON.stringify(closeData));
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({ message: "timeout issue" });
      }
    }, 10000);
    //@ts-ignore
    redis1.once("message", (channel, message) => {
      if (!res.headersSent) {
        clearTimeout(timeout);
        res.status(200).json(JSON.parse(message));
      }
    });
  } catch (err) {
    if (!res.headersSent) {
      res.status(401).json({ message: "there was some issue" });
    }
  }
});

app.get("/api1/v1/balance/usd", async (req: any, res: any) => {
  try {
    const user = req.user;
    const result = await pool.query("SELECT balance FROM users WHERE id = $1", [
      user.id,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "user not found" });
    }
    return res.json({ balance: result.rows[0].balance });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "there was some issue while fetching the balance" });
  }
});

app.get("/api1/v1/balance", async (req: any, res: any) => {
  const { username } = req.body;
  try {
    const rows = await pool.query("select * from users where username = $1", [
      username
    ]);
    const balance = rows.rows[0].balance;
    console.log(balance)
    return res.status(200).json({ message: balance });
  } catch (err) {
    return res
      .status(401)
      .json({ message: "There was some issue while fetching" });
  }
});

app.get("/api1/v1/suppotedAssets", async (req: any, res: any) => {
  const assets = {
    assets: [
      {
        symbol: "BTC",
        name: "Bitcoin",
        imageUrl: "image.com/png",
      },
      {
        symbol: "ETH",
        name: "Ethereum",
        imageUrl: "image.com/png",
      },
      {
        symbol: "SOL",
        name: "SOLANA",
        imageUrl: "image.com/png",
      },
    ],
  };
  return res.json(assets);
});

app.listen(3000, () => {
  console.log("im listening");
});
