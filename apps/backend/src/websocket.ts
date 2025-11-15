import type { FastifyInstance } from 'fastify';
import type { Redis as RedisType } from 'ioredis';
import Redis from 'ioredis';
import type { OrderStatusUpdate } from './types.js';
interface SocketStream {
  socket: {
    send: (data: string) => void;
    close: (code?: number, reason?: string) => void;
    on: (event: string, handler: (...args: any[]) => void) => void;
  };
}
export class WebSocketManager {
  private redis: RedisType;
  private subscribers: Map<string, Set<SocketStream>> = new Map();

  constructor(redis: RedisType) {
    this.redis = redis;
    this.setupRedisSubscriber();
  }
  private setupRedisSubscriber(): void {
    const subscriber = this.redis.duplicate();
      subscriber.on('pmessage', (pattern: string, channel: string, message: string) => {
      const orderId = channel.replace('order:', '').replace(':status', '');
      const update: OrderStatusUpdate = JSON.parse(message);
      const connections = this.subscribers.get(orderId);
      if (connections) {
        connections.forEach(ws => {
          try {
            ws.socket.send(JSON.stringify(update));
          } catch (error) {
            console.error(`[WebSocket] Error sending to ${orderId}:`, error);
          }
        });
      }
    });
    subscriber.psubscribe('order:*:status');
  }

  //handle ws connections
  handleConnection(connection: SocketStream, orderId: string): void {
    // Add connection to subscribers
    if (!this.subscribers.has(orderId)) {
      this.subscribers.set(orderId, new Set());
    }
    this.subscribers.get(orderId)!.add(connection);
    console.log(` ws client connected for order ${orderId}`);
    connection.socket.send(JSON.stringify({
      type: 'connected',
      orderId,
      message: 'ws connection done'
    }));

    connection.socket.on('close', () => {
      const connections = this.subscribers.get(orderId);
      if (connections) {
        connections.delete(connection);
        // delete the sub is there are no more connections
        if (connections.size === 0) {
          this.subscribers.delete(orderId);
        }
      }
      console.log(`ws client disconnected for order ${orderId}`);
    });

    connection.socket.on('error', (error: Error) => {
      console.error(` error for order ${orderId}:`, error);
    });
  }
  async close(): Promise<void> {
    this.subscribers.clear();
  }
}

export function registerWebSocket(fastify: FastifyInstance, wsManager: WebSocketManager): void {
  fastify.register(async function (fastify: any) {
    fastify.get('/api/orders/:orderId/status', { websocket: true }, (connection: SocketStream, req: any) => {
      const orderId = req.params['orderId'] as string;
      if (!orderId) {
        connection.socket.close(1008, 'order is is needed');
        return;
      }
      wsManager.handleConnection(connection, orderId);
    });
  });
}

