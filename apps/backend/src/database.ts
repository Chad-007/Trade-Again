import { Pool } from 'pg';
import type { Order, OrderStatus } from './types.js';
//import type { Pool as PoolType } from 'pg';

export class Database {
  private pool: Pool;

  constructor() {
  this.pool = new Pool({
  host: "dpg-d4clhu2dbo4c73db60ng-a.oregon-postgres.render.com",
  port: 5432,
  user: "new_lgkz_user",
  password: "Kr9jSMYhAuIo6UG742BdU5aVxC5Ikigp",
  database: "new_lgkz",
  ssl: { rejectUnauthorized: false }
});

  }
  async initialize(): Promise<void> {
    // create the orders table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        order_id VARCHAR(255) PRIMARY KEY,
        user_id INTEGER NOT NULL,
        type VARCHAR(50) NOT NULL,
        token_in VARCHAR(50) NOT NULL,
        token_out VARCHAR(50) NOT NULL,
        amount_in NUMERIC NOT NULL,
        amount_out NUMERIC,
        status VARCHAR(50) NOT NULL,
        dex VARCHAR(50),
        tx_hash VARCHAR(255),
        executed_price NUMERIC,
        error TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // create indexes
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    `);
  }
  // create an order
  async createOrder(order: Order): Promise<void> {
    await this.pool.query(
      `INSERT INTO orders (
        order_id, user_id, type, token_in, token_out, 
        amount_in, amount_out, status, dex, tx_hash, 
        executed_price, error, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        order.orderId,
        order.userId,
        order.type,
        order.tokenIn,
        order.tokenOut,
        order.amountIn,
        order.amountOut || null,
        order.status,
        order.dex || null,
        order.txHash || null,
        order.executedPrice || null,
        order.error || null,
        order.createdAt,
        order.updatedAt
      ]
    );
  }
  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    updates?: Partial<Order>
  ): Promise<void> {
    const fields: string[] = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
    const values: any[] = [orderId, status];
    let paramIndex = 3;

    if (updates?.dex) {
      fields.push(`dex = $${paramIndex}`);
      values.push(updates.dex);
      paramIndex++;
    }
    if (updates?.txHash) {
      fields.push(`tx_hash = $${paramIndex}`);
      values.push(updates.txHash);
      paramIndex++;
    }
    if (updates?.executedPrice !== undefined) {
      fields.push(`executed_price = $${paramIndex}`);
      values.push(updates.executedPrice);
      paramIndex++;
    }
    if (updates?.amountOut !== undefined) {
      fields.push(`amount_out = $${paramIndex}`);
      values.push(updates.amountOut);
      paramIndex++;
    }
    if (updates?.error) {
      fields.push(`error = $${paramIndex}`);
      values.push(updates.error);
      paramIndex++;
    }

    await this.pool.query(
      `UPDATE orders SET ${fields.join(', ')} WHERE order_id = $1`,
      values
    );
  }
  async getOrder(orderId: string): Promise<Order | null> {
    const result = await this.pool.query(
      'SELECT * FROM orders WHERE order_id = $1',
      [orderId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    const row = result.rows[0];
    const order: Order = {
      orderId: row.order_id,
      userId: row.user_id,
      type: row.type,
      tokenIn: row.token_in,
      tokenOut: row.token_out,
      amountIn: parseFloat(row.amount_in),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
    if (row.amount_out) order.amountOut = parseFloat(row.amount_out);
    if (row.dex) order.dex = row.dex;
    if (row.tx_hash) order.txHash = row.tx_hash;
    if (row.executed_price) order.executedPrice = parseFloat(row.executed_price);
    if (row.error) order.error = row.error;
    return order;
  }

  // get orders by user ID
  async getOrdersByUserId(userId: number, limit: number = 50): Promise<Order[]> {
    const result = await this.pool.query(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit]
    );
    return result.rows.map((row: any) => {
      const order: Order = {
        orderId: row.order_id,
        userId: row.user_id,
        type: row.type,
        tokenIn: row.token_in,
        tokenOut: row.token_out,
        amountIn: parseFloat(row.amount_in),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
      if (row.amount_out) order.amountOut = parseFloat(row.amount_out);
      if (row.dex) order.dex = row.dex;
      if (row.tx_hash) order.txHash = row.tx_hash;
      if (row.executed_price) order.executedPrice = parseFloat(row.executed_price);
      if (row.error) order.error = row.error;
      return order;
    });
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}

