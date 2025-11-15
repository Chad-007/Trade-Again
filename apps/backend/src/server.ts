import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { v4 as uuidv4 } from 'uuid';
import { Database } from './database.js';
import { OrderQueue } from './queue.js';
import type { Order, OrderType } from './types.js';
import type { Redis as RedisType } from 'ioredis';
import Redis from 'ioredis';
import type { WebSocket } from 'ws';

const PORT = 3000;

export class OrderExecutionServer {
  private fastify: ReturnType<typeof Fastify>;
  private db: Database;
  private queue: OrderQueue;
  private redis: RedisType;
  private connections = new Map<number, WebSocket[]>();

  constructor() {
    this.fastify = Fastify({ logger: true });
    //@ts-ignore
    this.redis = new (Redis)({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
    this.db = new Database();
    this.queue = new OrderQueue(this.db, this.redis);
  }

  async start(): Promise<void> {
    await this.fastify.register(websocket);
    await this.db.initialize();
    this.registerRoutes();
    try {
      await this.fastify.listen({ port: PORT, host: '0.0.0.0' });
      console.log(`engine is running on the port ${PORT}`);
    } catch (err) {
      console.log(err);
    }
  }

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
            websocketUrl: `/api/ws/${userId}`
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
        const stats = await this.queue.getStats();
        return reply.status(200).send(stats);
      } catch (error) {
            console.log(error);
      }
    });

    this.fastify.get(
      '/api/ws/:userId',
      { websocket: true },
      //@ts-ignore
      (connection, request: any) => {
        const { userId } = request.params;
        const userIdNum = parseInt(userId);

        if (!this.connections.has(userIdNum)) {
          this.connections.set(userIdNum, []);
        }
        this.connections.get(userIdNum)!.push(connection.socket);

        console.log(`WebSocket connection established for user ${userId}`);

        connection.socket.on('message', async (message: Buffer) => {
          try {
            const msg = JSON.parse(message.toString());
            
            if (msg.type === 'place_order') {
              const orderId = uuidv4();
              const order: Order = {
                orderId,
                userId: userIdNum,
                type: msg.data.type as OrderType,
                tokenIn: msg.data.tokenIn,
                tokenOut: msg.data.tokenOut,
                amountIn: msg.data.amountIn,
                status: 'pending',
                createdAt: new Date(),
                updatedAt: new Date()
              };

              await this.db.createOrder(order);
              await this.queue.addOrder({
                orderId,
                userId: userIdNum,
                type: msg.data.type,
                tokenIn: msg.data.tokenIn,
                tokenOut: msg.data.tokenOut,
                amountIn: msg.data.amountIn
              });

              connection.socket.send(JSON.stringify({
                type: 'order_placed',
                orderId,
                status: 'pending'
              }));

              console.log(`Order ${orderId} placed via WebSocket for user ${userId}`);
            }
          } catch (err) {
            console.error('Error handling WebSocket message:', err);
          }
        });
        //@ts-ignore
        const subscriber = new Redis({
          host: process.env.REDIS_HOST || '127.0.0.1',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        });
        //@ts-ignore
        subscriber.psubscribe(`order:*:status`, (err, count) => {
          if (err) {
            console.error(`Failed to subscribe to user ${userId} orders:`, err);
            return;
          }
          console.log(`Subscribed to all orders for user ${userId}`);
        });
        //@ts-ignore
        subscriber.on('pmessage', async (pattern, channel, message) => {
          try {
            const update = JSON.parse(message);
            
            const orderId = channel.split(':')[1];
            
            const order = await this.db.getOrder(orderId);
            if (order && order.userId === userIdNum) {
              const userConnections = this.connections.get(userIdNum) || [];
              userConnections.forEach(socket => {
                //@ts-ignore
                if (socket.readyState === WebSocket.OPEN) {
                  socket.send(JSON.stringify({
                    type: 'order_update',
                    ...update
                  }));
                }
              });
            }
          } catch (err) {
            console.error('Error processing Redis message:', err);
          }
        });

        connection.socket.on('close', () => {
          console.log(`WebSocket disconnected for user ${userId}`);
          
          const userConnections = this.connections.get(userIdNum) || [];
          const index = userConnections.indexOf(connection.socket);
          if (index > -1) {
            userConnections.splice(index, 1);
          }
          if (userConnections.length === 0) {
            this.connections.delete(userIdNum);
          }
          
          subscriber.punsubscribe();
          subscriber.quit();
        });

        //@ts-ignore
        connection.socket.on('error', (error) => {
          console.error(`WebSocket error for user ${userId}:`, error);
        });

        connection.socket.send(JSON.stringify({
          type: 'connected',
          userId: userIdNum,
          message: 'Connected to trading WebSocket'
        }));
      }
    );

    this.fastify.get('/health', async (request: any, reply: any) => {
      return reply.status(200).send({
        status: 'healthy',
      });
    });
  }

  async stop(): Promise<void> {
    await this.fastify.close();
    await this.queue.close();
    await this.db.close();
    await this.redis.quit();
  }
}