export type OrderType = 'market' | 'limit' | 'sniper';

export type OrderStatus = 
  | 'pending' 
  | 'routing' 
  | 'building' 
  | 'submitted' 
  | 'confirmed' 
  | 'failed';

export interface Order {
  orderId: string;
  userId: number;
  type: OrderType;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut?: number;
  status: OrderStatus;
  dex?: 'raydium' | 'meteora';
  txHash?: string;
  executedPrice?: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderRequest {
  type: OrderType;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  limitPrice?: number; // usually not used here
}

export interface DexQuote {
  price: number;
  fee: number;
  dex: 'raydium' | 'meteora';
  amountOut: number;
}

export interface OrderStatusUpdate {
  orderId: string;
  status: OrderStatus;
  dex?: 'raydium' | 'meteora';
  txHash?: string;
  executedPrice?: number;
  error?: string;
  timestamp: Date;
}

export interface SwapResult {
  txHash: string;
  executedPrice: number;
  amountOut: number;
}

