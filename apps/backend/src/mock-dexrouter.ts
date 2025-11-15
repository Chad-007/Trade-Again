import type { DexQuote, SwapResult, Order } from './types.js';
export class MockDexRouter {
  private basePrices: Map<string, number> = new Map();
  private getBasePrice(tokenIn: string, tokenOut: string): number {
    const pair = `${tokenIn}/${tokenOut}`;
    if (!this.basePrices.has(pair)) {
      this.basePrices.set(pair, 100 + Math.random() * 50);
    }
    return this.basePrices.get(pair)!;
  }

  //simulate the delay
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  //generate a random tx hash
  private generateMockTxHash(): string {
    const chars = '0123456789abcdef';
    let hash = '';
    for (let i = 0; i < 64; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)];
    }
    return hash;
  }

  //get a quote from raydium
  async getRaydiumQuote(
    tokenIn: string, 
    tokenOut: string, 
    amountIn: number
  ): Promise<DexQuote> {
    await this.sleep(200);
    const basePrice = this.getBasePrice(tokenIn, tokenOut);
    const price = basePrice * (0.98 + Math.random() * 0.04);
    const fee = 0.003; 
    const amountOut = amountIn * price * (1 - fee);
    return {
      price,
      fee,
      dex: 'raydium',
      amountOut
    };
  }

  //get quote from meteora
  async getMeteoraQuote(
    tokenIn: string, 
    tokenOut: string, 
    amountIn: number
  ): Promise<DexQuote> {
    await this.sleep(200);
    const basePrice = this.getBasePrice(tokenIn, tokenOut);
    const price = basePrice * (0.97 + Math.random() * 0.05);
    const fee = 0.002; 
    const amountOut = amountIn * price * (1 - fee);
    return {
      price,
      fee,
      dex: 'meteora',
      amountOut
    };
  }
  // compare both and reaturn the best one
  async getBestQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: number
  ): Promise<DexQuote> {
    const [raydiumQuote, meteoraQuote] = await Promise.all([
      this.getRaydiumQuote(tokenIn, tokenOut, amountIn),
      this.getMeteoraQuote(tokenIn, tokenOut, amountIn)
    ]);
    return raydiumQuote.amountOut >= meteoraQuote.amountOut 
      ? raydiumQuote 
      : meteoraQuote;
  }

  // execute swap on the selected dex
  async executeSwap(dex: 'raydium' | 'meteora', order: Order): Promise<SwapResult> {
    await this.sleep(2000 + Math.random() * 1000);
        if (Math.random() < 0.05) {
      throw new Error(`swap execution failed on ${dex}: Network timeout`);
    }
    const basePrice = this.getBasePrice(order.tokenIn, order.tokenOut);
    const slippage = 0.01; 
    const executedPrice = basePrice * (1 - slippage + Math.random() * slippage * 2);
    const amountOut = order.amountIn * executedPrice * (dex === 'raydium' ? 0.997 : 0.998);
    
    return {
      txHash: this.generateMockTxHash(),
      executedPrice,
      amountOut
    };
  }
}

