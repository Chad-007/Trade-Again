import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import type { OrderJobData } from './order-processor.js';
import { OrderProcessor } from './order-processor.js';
import { Database } from './database.js';

export class OrderQueue {
  private queue: Queue<OrderJobData>;
  private worker: Worker<OrderJobData>;
  private processor: OrderProcessor;
  //@ts-ignore
  private redis: Redis;

  private REDIS_URL =
    "rediss://default:AZQXAAIncDJkZjBhZjExM2E3OTA0MjcxYTYyOTFiNDMwOWZkYWRjNHAyMzc5MTE@sharp-mosquito-37911.upstash.io:6379";

  constructor(db: Database) {
    //@ts-ignore
    this.redis = new Redis(this.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.processor = new OrderProcessor(db, this.redis);

    const queueOptions = {
      connection: this.redis,
    };

    this.queue = new Queue<OrderJobData>('order-execution', queueOptions);

    this.worker = new Worker<OrderJobData>(
      'order-execution',
      async (job) => {
        await this.processor.processOrder(job);
      },
      {
        connection: this.redis,
        concurrency: 10,
        limiter: { max: 100, duration: 60000 }
      }
    );

    this.worker.on('completed', (job) => {
      console.log(`queue job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`queue job ${job?.id} failed:`, err.message);
    });
  }

  async addOrder(orderData: OrderJobData): Promise<string> {
    const job = await this.queue.add('execute-order', orderData, {
      jobId: orderData.orderId
    });
    return job.id!;
  }

  async getStats() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount()
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      total: waiting + active + completed + failed,
    };
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    await this.redis.quit();
  }
}
