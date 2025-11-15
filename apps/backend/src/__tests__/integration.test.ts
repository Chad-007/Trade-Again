/**
 * Integration tests for order execution flow
 * Tests the complete flow from order submission to WebSocket updates
 */

import { MockDexRouter } from '../mockDexRouter.js';
import { OrderProcessor } from '../orderProcessor.js';
import { Database } from '../database.js';
import Redis from 'ioredis';

describe('Order Execution Integration', () => {
  let dexRouter: MockDexRouter;
  let processor: OrderProcessor;
  let db: Database;
  let redis: Redis;

  beforeAll(() => {
    dexRouter = new MockDexRouter();
    redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
    db = new Database();
    processor = new OrderProcessor(db, redis);
  });

  afterAll(async () => {
    await redis.quit();
    await db.close();
  });

  describe('DEX Routing Flow', () => {
    it('should compare quotes from both DEXs and select best', async () => {
      const raydiumQuote = await dexRouter.getRaydiumQuote('SOL', 'USDC', 1);
      const meteoraQuote = await dexRouter.getMeteoraQuote('SOL', 'USDC', 1);
      const bestQuote = await dexRouter.getBestQuote('SOL', 'USDC', 1);

      expect(raydiumQuote.dex).toBe('raydium');
      expect(meteoraQuote.dex).toBe('meteora');
      expect(['raydium', 'meteora']).toContain(bestQuote.dex);
      
      // Best quote should have highest amountOut
      const isBest = bestQuote.amountOut >= raydiumQuote.amountOut &&
                     bestQuote.amountOut >= meteoraQuote.amountOut;
      expect(isBest).toBe(true);
    });

    it('should handle different token pairs', async () => {
      const solUsdc = await dexRouter.getBestQuote('SOL', 'USDC', 1);
      const ethUsdc = await dexRouter.getBestQuote('ETH', 'USDC', 1);

      expect(solUsdc.amountOut).toBeGreaterThan(0);
      expect(ethUsdc.amountOut).toBeGreaterThan(0);
      expect(solUsdc.dex).toBeDefined();
      expect(ethUsdc.dex).toBeDefined();
    });
  });

  describe('Order Status Lifecycle', () => {
    it('should progress through all statuses: pending → routing → building → submitted → confirmed', async () => {
      const statuses: string[] = [];
      const orderId = 'integration-test-order';

      // Mock status updates
      const originalUpdate = processor['updateStatus'].bind(processor);
      jest.spyOn(processor as any, 'updateStatus').mockImplementation(async (
        id: string,
        status: string
      ) => {
        statuses.push(status);
        return originalUpdate(id, status as any);
      });

      // Mock successful swap
      jest.spyOn(dexRouter, 'executeSwap').mockResolvedValue({
        txHash: 'integration-tx-123',
        executedPrice: 100,
        amountOut: 99.7
      });

      const job = {
        data: {
          orderId,
          userId: 1,
          type: 'market',
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amountIn: 1
        }
      } as any;

      await processor.processOrder(job);

      // Verify status progression
      expect(statuses).toContain('routing');
      expect(statuses).toContain('building');
      expect(statuses).toContain('submitted');
      expect(statuses).toContain('confirmed');
    });
  });

  describe('Error Handling', () => {
    it('should handle DEX execution failures gracefully', async () => {
      const orderId = 'error-test-order';

      // Mock swap failure
      jest.spyOn(dexRouter, 'executeSwap').mockRejectedValue(
        new Error('Network timeout')
      );

      const job = {
        data: {
          orderId,
          userId: 1,
          type: 'market',
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amountIn: 1
        }
      } as any;

      await expect(processor.processOrder(job)).resolves.not.toThrow();

      // Verify failure status was set
      expect(processor['updateStatus']).toHaveBeenCalledWith(
        orderId,
        'failed',
        expect.any(String)
      );
    });
  });
});

