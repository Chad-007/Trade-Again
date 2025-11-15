import { Queue, Worker } from 'bullmq';
import type { QueueOptions } from 'bullmq';
import type { Redis as RedisType } from 'ioredis';
import type { OrderJobData } from './order-processor.js';
import { OrderProcessor } from './order-processor.js';
import { Database } from './database.js';
export class OrderQueue {
  private queue: Queue<OrderJobData>;
  private worker: Worker<OrderJobData>;
  private processor: OrderProcessor;
  private redis: RedisType;

  constructor(db: Database, redis: RedisType) {
    this.redis = redis;
    this.processor = new OrderProcessor(db, redis);
    const queueOptions: QueueOptions = {
      connection: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      defaultJobOptions: {
        attempts: 1, // retries handled in processor
        removeOnComplete: {
          age: 3600, // keep completed jobs for 1 hour
          count: 1000
        },
        removeOnFail: {
          age: 86400 // keep failed jobs for 24 hours
        }
      }
    };
    this.queue = new Queue<OrderJobData>('order-execution', queueOptions);

    // worker with concurrency limit (10 concurrent orders)
    this.worker = new Worker<OrderJobData>(
      'order-execution',
      async (job: any) => {
        await this.processor.processOrder(job);
      },
      {
        ...queueOptions,
        concurrency: 10, // max 10 concurrent orders
        limiter: {
          max: 100, // max 100 jobs
          duration: 60000 // per 60 seconds (100 orders/minute)
        }
      }
    );
    this.worker.on('completed', (job: any) => {
      console.log(`queue job ${job.id} completed`);
    });

    this.worker.on('failed', (job: any, err: Error) => {
      console.error(`queue job ${job?.id} failed:`, err.message);
    });
  }
  async addOrder(orderData: OrderJobData): Promise<string> {
    const job = await this.queue.add('execute-order', orderData, {
      jobId: orderData.orderId // use orderId as jobid
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
      total: waiting + active + completed + failed
    };
  }
  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}

