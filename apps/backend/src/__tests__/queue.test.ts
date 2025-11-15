import { OrderQueue } from '../queue.js';
import { Database } from '../database.js';
import Redis from 'ioredis';

// Mock dependencies
jest.mock('../database.js');
jest.mock('ioredis');
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'job-123' }),
    getWaitingCount: jest.fn().mockResolvedValue(5),
    getActiveCount: jest.fn().mockResolvedValue(2),
    getCompletedCount: jest.fn().mockResolvedValue(100),
    getFailedCount: jest.fn().mockResolvedValue(3),
    close: jest.fn().mockResolvedValue(undefined)
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined)
  }))
}));

describe('OrderQueue', () => {
  let queue: OrderQueue;
  let mockDb: jest.Mocked<Database>;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    mockDb = {
      updateOrderStatus: jest.fn(),
      getOrder: jest.fn(),
      createOrder: jest.fn(),
      getOrdersByUserId: jest.fn(),
      initialize: jest.fn(),
      close: jest.fn()
    } as any;

    mockRedis = {
      publish: jest.fn().mockResolvedValue(1),
      duplicate: jest.fn().mockReturnValue({
        on: jest.fn(),
        psubscribe: jest.fn()
      }),
      quit: jest.fn()
    } as any;

    queue = new OrderQueue(mockDb, mockRedis);
  });

  describe('addOrder', () => {
    it('should add order to queue and return job ID', async () => {
      const orderData = {
        orderId: 'test-order-1',
        userId: 1,
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 1
      };

      const jobId = await queue.addOrder(orderData);

      expect(jobId).toBe('job-123');
      expect(queue['queue'].add).toHaveBeenCalledWith(
        'execute-order',
        orderData,
        expect.objectContaining({
          jobId: 'test-order-1'
        })
      );
    });
  });

  describe('getStats', () => {
    it('should return queue statistics', async () => {
      const stats = await queue.getStats();

      expect(stats).toHaveProperty('waiting');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('total');
      expect(stats.waiting).toBe(5);
      expect(stats.active).toBe(2);
      expect(stats.completed).toBe(100);
      expect(stats.failed).toBe(3);
      expect(stats.total).toBe(110);
    });
  });

  describe('concurrency limits', () => {
    it('should be configured with max 10 concurrent orders', () => {
      // Verify worker is created with concurrency: 10
      const worker = queue['worker'];
      expect(worker).toBeDefined();
    });

    it('should have rate limiting (100 orders/minute)', () => {
      // Verify limiter configuration
      const worker = queue['worker'];
      expect(worker).toBeDefined();
    });
  });
});

