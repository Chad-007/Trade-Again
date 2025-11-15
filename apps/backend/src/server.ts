import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { v4 as uuidv4 } from 'uuid';
import { Database } from './database.js';
import { OrderQueue } from './queue.js';
import { WebSocketManager, registerWebSocket } from './websocket.js';
import type { Order, OrderType } from './types.js';
import type { Redis as RedisType } from 'ioredis';
import Redis from 'ioredis';
const PORT = 3000;
export class OrderExecutionServer {
  private fastify: ReturnType<typeof Fastify>;
  private db: Database;
  private queue: OrderQueue;
  private wsManager: WebSocketManager;
  private redis: RedisType;
  // initialize all the endpoints
  constructor() {
    this.fastify = Fastify({ logger: true });
    // @ts-ignore
    this.redis = new (Redis)({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
    this.db = new Database();
    this.queue = new OrderQueue(this.db, this.redis);
    this.wsManager = new WebSocketManager(this.redis);
  }
  async start(): Promise<void> {
    await this.fastify.register(websocket);
    await this.db.initialize();
    this.registerRoutes();
    registerWebSocket(this.fastify, this.wsManager);
    try {
      await this.fastify.listen({ port: PORT, host: '0.0.0.0' });
      console.log(`engine is running on the port ${PORT}`);
    } catch (err) {
      console.log(err);
    }
  }

  // routte register
  private registerRoutes(): void {
    this.fastify.post(
      '/api/orders/execute',
      async (request: any, reply: any) => {
        try {
          const { type, tokenIn, tokenOut, amountIn, limitPrice } = request.body;
          if (!type || !tokenIn || !tokenOut || !amountIn) {
            return reply.status(400).send({
              error: 'missing some of the fields'
            });
          }
          if (type !== 'market') {
            return reply.status(400).send({
              error: 'market order only for now'
            });
          }
          if (amountIn <= 0) {
            return reply.status(400).send({
              error: 'amount should be greater than 0'
            });
          }

          // use 1 for now
          const userId = request.body.userId || 1;
          const orderId = uuidv4();
          const order: Order = {
            orderId,
            userId,
            type: type as OrderType,
            tokenIn,
            tokenOut,
            amountIn,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          await this.db.createOrder(order);
          await this.queue.addOrder({
            orderId,
            userId,
            type,
            tokenIn,
            tokenOut,
            amountIn
          });

          console.log(`order ${orderId} queued for execution`);
          return reply.status(200).send({
            orderId,
            status: 'pending',
            message: `order ${orderId} queued for execution`,
            websocketUrl: `/api/orders/${orderId}/status`
          });
        } catch (error) {
            console.log(error);
        }
      }
    );
    this.fastify.get(
      '/api/orders/:orderId',
      async (request: any, reply: any) => {
        try {
          const { orderId } = request.params;
          const order = await this.db.getOrder(orderId);
          if (!order) {
            return reply.status(404).send({
              error: 'Order not found'
            });
          }
          return reply.status(200).send(order);
        } catch (error) {
            console.log(error);
        }
      }
    );

    this.fastify.get(
      '/api/orders',
      async (request: any, reply: any) => {
        try {
          const userId = request.query.userId ? parseInt(request.query.userId) : 1;
          // get the last 50 orders for now
          const limit = request.query.limit ? parseInt(request.query.limit) : 50;
          const orders = await this.db.getOrdersByUserId(userId, limit);
          return reply.status(200).send({ orders });
        } catch (error) {
            console.log(error);
        }
      }
    );
    
    this.fastify.get('/api/queue/stats', async (request: any, reply: any) => {
      try {
        // get the status of the queue
        const stats = await this.queue.getStats();
        return reply.status(200).send(stats);
      } catch (error) {
            console.log(error);
      }
    });


    // random health endpoint
    this.fastify.get('/health', async (request: any, reply: any) => {
      return reply.status(200).send({
        status: 'healthy',
      });
    });
  }

  // stop the server
  async stop(): Promise<void> {
    await this.fastify.close();
    await this.queue.close();
    await this.wsManager.close();
    await this.db.close();
    await this.redis.quit();
  }
}

