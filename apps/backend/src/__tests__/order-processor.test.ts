import { OrderProcessor } from '../order-processor.js';
import { Database } from '../database.js';
import Redis from 'ioredis';
import { OrderJobData } from '../order-processor.js';
import { Job } from 'bullmq';

// Mock dependencies
jest.mock('../database.js');
jest.mock('../mockDexRouter.js');
jest.mock('ioredis');

describe('OrderProcessor', () => {
  let processor: OrderProcessor;
  let mockDb: jest.Mocked<Database>;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    mockDb = {
      updateOrderStatus: jest.fn().mockResolvedValue(undefined),
      getOrder: jest.fn(),
      createOrder: jest.fn(),
      getOrdersByUserId: jest.fn(),
      initialize: jest.fn(),
      close: jest.fn()
    } as any;

    mockRedis = {
      publish: jest.fn().mockResolvedValue(1),
      quit: jest.fn()
    } as any;

    processor = new OrderProcessor(mockDb, mockRedis);
  });

  describe('processOrder', () => {
    it('should process order through all statuses', async () => {
      const jobData: OrderJobData = {
        orderId: 'test-order-1',
        userId: 1,
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 1
      };

      const mockJob = {
        data: jobData
      } as Job<OrderJobData>;

      // Mock successful execution
      jest.spyOn(processor as any, 'executeWithRetry').mockResolvedValue({
        txHash: 'abc123',
        executedPrice: 100,
        amountOut: 99.7
      });

      await processor.processOrder(mockJob);

      // Verify status updates were called
      expect(mockDb.updateOrderStatus).toHaveBeenCalledWith(
        'test-order-1',
        'routing',
        expect.any(Object)
      );
      expect(mockDb.updateOrderStatus).toHaveBeenCalledWith(
        'test-order-1',
        'confirmed',
        expect.objectContaining({
          txHash: 'abc123',
          executedPrice: 100,
          amountOut: 99.7
        })
      );
    });

    it('should handle execution failures', async () => {
      const jobData: OrderJobData = {
        orderId: 'test-order-2',
        userId: 1,
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 1
      };

      const mockJob = {
        data: jobData
      } as Job<OrderJobData>;

      // Mock failure
      jest.spyOn(processor as any, 'executeWithRetry').mockRejectedValue(
        new Error('Swap execution failed')
      );

      await processor.processOrder(mockJob);

      // Verify failure status was set
      expect(mockDb.updateOrderStatus).toHaveBeenCalledWith(
        'test-order-2',
        'failed',
        expect.objectContaining({
          error: expect.stringContaining('Swap execution failed')
        })
      );
    });
  });

  describe('executeWithRetry', () => {
    it('should retry on failure with exponential backoff', async () => {
      const order = {
        orderId: 'test-order-3',
        userId: 1,
        type: 'market' as const,
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 1,
        status: 'submitted' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock first two attempts failing, third succeeding
      let attemptCount = 0;
      jest.spyOn(processor['dexRouter'], 'executeSwap').mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Network timeout');
        }
        return {
          txHash: 'success123',
          executedPrice: 100,
          amountOut: 99.7
        };
      });

      const start = Date.now();
      const result = await (processor as any).executeWithRetry('raydium', order);
      const duration = Date.now() - start;

      expect(result.txHash).toBe('success123');
      expect(attemptCount).toBe(3);
      // Should have delays: ~1s + ~2s = ~3s minimum
      expect(duration).toBeGreaterThan(2500);
    });

    it('should fail after max retries', async () => {
      const order = {
        orderId: 'test-order-4',
        userId: 1,
        type: 'market' as const,
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 1,
        status: 'submitted' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock all attempts failing
      jest.spyOn(processor['dexRouter'], 'executeSwap').mockRejectedValue(
        new Error('Persistent failure')
      );

      await expect(
        (processor as any).executeWithRetry('meteora', order)
      ).rejects.toThrow('Swap failed after 3 attempts');
    });
  });
});

