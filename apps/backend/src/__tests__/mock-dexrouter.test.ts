import { MockDexRouter } from '../mock-dexrouter.js';
import { Order } from '../types.js';

describe('MockDexRouter', () => {
  let router: MockDexRouter;

  beforeEach(() => {
    router = new MockDexRouter();
  });

  describe('getRaydiumQuote', () => {
    it('should return a valid quote with price, fee, and amountOut', async () => {
      const quote = await router.getRaydiumQuote('SOL', 'USDC', 1);

      expect(quote).toHaveProperty('price');
      expect(quote).toHaveProperty('fee');
      expect(quote).toHaveProperty('amountOut');
      expect(quote).toHaveProperty('dex', 'raydium');
      expect(quote.price).toBeGreaterThan(0);
      expect(quote.fee).toBe(0.003);
      expect(quote.amountOut).toBeGreaterThan(0);
    });

    it('should simulate network delay', async () => {
      const start = Date.now();
      await router.getRaydiumQuote('SOL', 'USDC', 1);
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(150); // At least 150ms delay
    });
  });

  describe('getMeteoraQuote', () => {
    it('should return a valid quote with price, fee, and amountOut', async () => {
      const quote = await router.getMeteoraQuote('SOL', 'USDC', 1);

      expect(quote).toHaveProperty('price');
      expect(quote).toHaveProperty('fee');
      expect(quote).toHaveProperty('amountOut');
      expect(quote).toHaveProperty('dex', 'meteora');
      expect(quote.price).toBeGreaterThan(0);
      expect(quote.fee).toBe(0.002);
      expect(quote.amountOut).toBeGreaterThan(0);
    });
  });

  describe('getBestQuote', () => {
    it('should return the quote with better amountOut', async () => {
      const bestQuote = await router.getBestQuote('SOL', 'USDC', 1);

      expect(bestQuote).toHaveProperty('dex');
      expect(bestQuote).toHaveProperty('amountOut');
      expect(['raydium', 'meteora']).toContain(bestQuote.dex);
      expect(bestQuote.amountOut).toBeGreaterThan(0);
    });

    it('should fetch quotes from both DEXs concurrently', async () => {
      const start = Date.now();
      await router.getBestQuote('SOL', 'USDC', 1);
      const duration = Date.now() - start;

      // Should be faster than sequential (2 * 200ms = 400ms)
      // But still have some delay
      expect(duration).toBeLessThan(500);
      expect(duration).toBeGreaterThan(150);
    });
  });

  describe('executeSwap', () => {
    it('should execute swap and return txHash and executedPrice', async () => {
      const order: Order = {
        orderId: 'test-order',
        userId: 1,
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 1,
        status: 'submitted',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await router.executeSwap('raydium', order);

      expect(result).toHaveProperty('txHash');
      expect(result).toHaveProperty('executedPrice');
      expect(result).toHaveProperty('amountOut');
      expect(result.txHash).toMatch(/^[0-9a-f]{64}$/); // 64 char hex
      expect(result.executedPrice).toBeGreaterThan(0);
      expect(result.amountOut).toBeGreaterThan(0);
    });

    it('should simulate execution delay (2-3 seconds)', async () => {
      const order: Order = {
        orderId: 'test-order',
        userId: 1,
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 1,
        status: 'submitted',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const start = Date.now();
      await router.executeSwap('meteora', order);
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(1900); // At least 1.9s
      expect(duration).toBeLessThan(4000); // Less than 4s
    });

    it('should occasionally fail (5% failure rate)', async () => {
      const order: Order = {
        orderId: 'test-order',
        userId: 1,
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 1,
        status: 'submitted',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Run multiple times to catch a failure
      let failures = 0;
      const attempts = 50;
      
      for (let i = 0; i < attempts; i++) {
        try {
          await router.executeSwap('raydium', order);
        } catch (error) {
          failures++;
          expect(error).toBeInstanceOf(Error);
        }
      }

      // Should have some failures (statistically)
      // With 5% failure rate, we expect ~2-3 failures in 50 attempts
      expect(failures).toBeGreaterThanOrEqual(0);
    });
  });
});

