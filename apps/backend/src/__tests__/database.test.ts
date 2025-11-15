import { Database } from '../database.js';
import { Order, OrderStatus } from '../types.js';
import { Pool } from 'pg';

jest.mock('pg');

describe('Database', () => {
  let db: Database;
  let mockPool: jest.Mocked<Pool>;

  beforeEach(() => {
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      end: jest.fn().mockResolvedValue(undefined)
    } as any;

    (Pool as jest.Mock).mockImplementation(() => mockPool);
    db = new Database();
  });

  describe('initialize', () => {
    it('should create orders table and indexes', async () => {
      await db.initialize();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS orders')
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_orders_user_id')
      );
    });
  });

  describe('createOrder', () => {
    it('should insert order into database', async () => {
      const order: Order = {
        orderId: 'test-order-1',
        userId: 1,
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 1,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await db.createOrder(order);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO orders'),
        expect.arrayContaining([
          'test-order-1',
          1,
          'market',
          'SOL',
          'USDC',
          1
        ])
      );
    });
  });

  describe('updateOrderStatus', () => {
    it('should update order status', async () => {
      await db.updateOrderStatus('test-order-1', 'confirmed', {
        txHash: 'abc123',
        executedPrice: 100
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE orders SET'),
        expect.arrayContaining(['test-order-1', 'confirmed'])
      );
    });

    it('should update multiple fields', async () => {
      await db.updateOrderStatus('test-order-2', 'routing', {
        dex: 'raydium',
        txHash: 'tx123',
        executedPrice: 99.5,
        amountOut: 99.2
      });

      const call = mockPool.query.mock.calls[0];
      expect(call[0]).toContain('dex =');
      expect(call[0]).toContain('tx_hash =');
      expect(call[0]).toContain('executed_price =');
      expect(call[0]).toContain('amount_out =');
    });
  });

  describe('getOrder', () => {
    it('should return order if found', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          order_id: 'test-order-1',
          user_id: 1,
          type: 'market',
          token_in: 'SOL',
          token_out: 'USDC',
          amount_in: '1',
          amount_out: '99.7',
          status: 'confirmed',
          dex: 'raydium',
          tx_hash: 'abc123',
          executed_price: '100',
          error: null,
          created_at: new Date(),
          updated_at: new Date()
        }]
      });

      const order = await db.getOrder('test-order-1');

      expect(order).not.toBeNull();
      expect(order?.orderId).toBe('test-order-1');
      expect(order?.status).toBe('confirmed');
      expect(order?.txHash).toBe('abc123');
    });

    it('should return null if order not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const order = await db.getOrder('non-existent');

      expect(order).toBeNull();
    });
  });

  describe('getOrdersByUserId', () => {
    it('should return orders for user', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            order_id: 'order-1',
            user_id: 1,
            type: 'market',
            token_in: 'SOL',
            token_out: 'USDC',
            amount_in: '1',
            amount_out: '99.7',
            status: 'confirmed',
            dex: 'raydium',
            tx_hash: 'abc123',
            executed_price: '100',
            error: null,
            created_at: new Date(),
            updated_at: new Date()
          }
        ]
      });

      const orders = await db.getOrdersByUserId(1, 50);

      expect(orders).toHaveLength(1);
      expect(orders[0].orderId).toBe('order-1');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM orders WHERE user_id'),
        [1, 50]
      );
    });
  });
});

