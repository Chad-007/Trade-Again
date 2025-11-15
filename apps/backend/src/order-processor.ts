import type { Job } from 'bullmq';
import type { Order, OrderStatus, SwapResult } from './types.js';
import { MockDexRouter } from './mock-dexrouter.js';
import { Database } from './database.js';
import type { Redis as RedisType } from 'ioredis';
import Redis from 'ioredis';

export interface OrderJobData {
  orderId: string;
  userId: number;
  type: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
}

// order processor the main thing
export class OrderProcessor {
  private dexRouter: MockDexRouter;
  private db: Database;
  private redis: RedisType;
  private maxRetries = 3;

  constructor(db: Database, redis: RedisType) {
    this.dexRouter = new MockDexRouter();
    this.db = db;
    this.redis = redis;
  }
  async processOrder(job: Job<OrderJobData>): Promise<void> {
    const { orderId, userId, type, tokenIn, tokenOut, amountIn } = job.data;

    try {
      await this.updateStatus(orderId, 'routing');
      const bestQuote = await this.dexRouter.getBestQuote(tokenIn, tokenOut, amountIn);
      
      console.log(`order ${orderId} best quote: ${bestQuote.dex} - price: ${bestQuote.price.toFixed(4)}, amount out: ${bestQuote.amountOut.toFixed(4)}`);
      await this.db.updateOrderStatus(orderId, 'routing', { dex: bestQuote.dex });
      await this.updateStatus(orderId, 'building');
      await this.sleep(500);
      await this.updateStatus(orderId, 'submitted');
      const swapResult = await this.executeWithRetry(
        orderId,
        bestQuote.dex as 'raydium' | 'meteora',
        { orderId, userId, type, tokenIn, tokenOut, amountIn } as Order
      );
      await this.db.updateOrderStatus(orderId, 'confirmed', {
        txHash: swapResult.txHash,
        executedPrice: swapResult.executedPrice,
        amountOut: swapResult.amountOut
      });
      await this.updateStatus(orderId, 'confirmed');
      console.log(`order ${orderId}] confirmed - tx: ${swapResult.txHash}, price: ${swapResult.executedPrice.toFixed(4)}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.log(`order ${orderId}] failed:`, errorMessage);

      await this.db.updateOrderStatus(orderId, 'failed', {
        error: errorMessage
      });
      await this.updateStatus(orderId, 'failed', errorMessage);
    }
  }
  // execute swap with exponential backoff retry
  private async executeWithRetry(
    orderId: string,
    dex: 'raydium' | 'meteora',
    order: Order
  ): Promise<SwapResult> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.dexRouter.executeSwap(dex, order);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.log(`[Order ${orderId}] Attempt ${attempt}/${this.maxRetries} failed:`, lastError.message);

        if (attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000;
          console.log(`[Order ${orderId}] Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`Swap failed after ${this.maxRetries} attempts: ${lastError?.message}`);
  }

  // update and broadcast order status
  private async updateStatus(
    orderId: string,
    status: OrderStatus,
    error?: string
  ): Promise<void> {
    const update = {
      orderId,
      status,
      timestamp: new Date(),
      ...(error && { error })
    };
    await this.redis.publish(
      `order:${orderId}:status`,
      JSON.stringify(update)
    );
  }
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

