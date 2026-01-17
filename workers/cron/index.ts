import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

// Inline types since we can't import from src
interface Env {
  DATABASE_URL: string;
}

interface HistoricalPrice {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Yahoo Finance fetch functions
async function fetchHistoricalDaily(
  symbol: string,
  from: Date,
  to: Date = new Date()
): Promise<HistoricalPrice[]> {
  const period1 = Math.floor(from.getTime() / 1000);
  const period2 = Math.floor(to.getTime() / 1000);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      console.error(`Yahoo Finance error: ${response.status}`);
      return [];
    }

    const data = await response.json() as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              open?: number[];
              high?: number[];
              low?: number[];
              close?: number[];
              volume?: number[];
            }>;
          };
        }>;
      };
    };

    const result = data.chart?.result?.[0];
    if (!result?.timestamp || !result?.indicators?.quote?.[0]) {
      return [];
    }

    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];

    const prices: HistoricalPrice[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (
        quote.open?.[i] != null &&
        quote.high?.[i] != null &&
        quote.low?.[i] != null &&
        quote.close?.[i] != null
      ) {
        prices.push({
          date: new Date(timestamps[i] * 1000),
          open: quote.open[i],
          high: quote.high[i],
          low: quote.low[i],
          close: quote.close[i],
          volume: quote.volume?.[i] || 0
        });
      }
    }

    return prices;
  } catch (error) {
    console.error(`Error fetching ${symbol}:`, error);
    return [];
  }
}

// Simple Wyckoff detection for cron worker
function detectWyckoffPhase(prices: HistoricalPrice[]): {
  phase: string;
  subPhase: string;
  strength: number;
  support: number;
  resistance: number;
  reasoning: string;
} {
  if (prices.length < 50) {
    const currentPrice = prices[prices.length - 1]?.close || 0;
    return {
      phase: 'accumulation',
      subPhase: 'A',
      strength: 0,
      support: currentPrice * 0.95,
      resistance: currentPrice * 1.05,
      reasoning: 'Insufficient data'
    };
  }

  const closes = prices.map((p) => p.close);
  const currentPrice = closes[closes.length - 1];

  // Calculate simple MAs
  const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const ma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;

  // Find support/resistance
  const recentHighs = prices.slice(-30).map((p) => p.high);
  const recentLows = prices.slice(-30).map((p) => p.low);
  const resistance = Math.max(...recentHighs);
  const support = Math.min(...recentLows);

  // Simple phase detection
  const aboveMa20 = currentPrice > ma20;
  const aboveMa50 = currentPrice > ma50;
  const priceRange = resistance - support;
  const pricePosition = (currentPrice - support) / priceRange;

  let phase: string;
  let subPhase: string;
  let strength: number;
  let reasoning: string;

  if (!aboveMa20 && !aboveMa50 && pricePosition < 0.3) {
    phase = 'accumulation';
    subPhase = 'B';
    strength = 40 + pricePosition * 30;
    reasoning = 'Price consolidating near lows, below moving averages';
  } else if (aboveMa20 && aboveMa50 && ma20 > ma50) {
    phase = 'markup';
    subPhase = 'D';
    strength = 50 + pricePosition * 30;
    reasoning = 'Price in uptrend, above moving averages';
  } else if (aboveMa20 && aboveMa50 && pricePosition > 0.7) {
    phase = 'distribution';
    subPhase = 'B';
    strength = 40 + (1 - pricePosition) * 30;
    reasoning = 'Price consolidating near highs';
  } else if (!aboveMa20 && !aboveMa50 && ma20 < ma50) {
    phase = 'markdown';
    subPhase = 'D';
    strength = 50 + (1 - pricePosition) * 30;
    reasoning = 'Price in downtrend, below moving averages';
  } else {
    phase = 'accumulation';
    subPhase = 'A';
    strength = 30;
    reasoning = 'Transitional phase';
  }

  return {
    phase,
    subPhase,
    strength: Math.min(100, Math.max(0, strength)),
    support,
    resistance,
    reasoning
  };
}

// Calculate target and cut loss
function calculateTargets(
  currentPrice: number,
  phase: string,
  support: number,
  resistance: number
): { targetPrice: number; cutLossPrice: number } {
  switch (phase) {
    case 'accumulation':
      return {
        targetPrice: resistance * 1.05,
        cutLossPrice: support * 0.97
      };
    case 'markup':
      return {
        targetPrice: currentPrice * 1.18,
        cutLossPrice: currentPrice * 0.92
      };
    case 'distribution':
      return {
        targetPrice: support - (resistance - support) * 0.5,
        cutLossPrice: resistance * 1.03
      };
    case 'markdown':
      return {
        targetPrice: currentPrice * 0.82,
        cutLossPrice: currentPrice * 1.08
      };
    default:
      return {
        targetPrice: currentPrice * 1.10,
        cutLossPrice: currentPrice * 0.95
      };
  }
}

// Cron handler
async function handleCron(env: Env): Promise<void> {
  console.log('Starting daily stock analysis cron job...');

  const sql = neon(env.DATABASE_URL);
  const db = drizzle(sql);

  try {
    // Get all unique tickers from search history
    const tickersResult = await sql`
      SELECT DISTINCT t.id, t.symbol
      FROM tickers t
      INNER JOIN search_history sh ON t.id = sh.ticker_id
    `;

    if (tickersResult.length === 0) {
      console.log('No tickers to analyze');
      return;
    }

    console.log(`Analyzing ${tickersResult.length} tickers...`);

    const today = new Date().toISOString().split('T')[0];
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 250);

    for (const ticker of tickersResult) {
      try {
        console.log(`Processing ${ticker.symbol}...`);

        // Fetch historical data
        const prices = await fetchHistoricalDaily(ticker.symbol as string, fromDate);

        if (prices.length === 0) {
          console.log(`No data for ${ticker.symbol}`);
          continue;
        }

        // Save prices
        for (const price of prices) {
          const dateStr = price.date.toISOString().split('T')[0];
          await sql`
            INSERT INTO prices_daily (ticker_id, date, open, high, low, close, volume)
            VALUES (${ticker.id}, ${dateStr}, ${price.open}, ${price.high}, ${price.low}, ${price.close}, ${price.volume})
            ON CONFLICT (ticker_id, date) DO UPDATE SET
              open = EXCLUDED.open,
              high = EXCLUDED.high,
              low = EXCLUDED.low,
              close = EXCLUDED.close,
              volume = EXCLUDED.volume
          `;
        }

        // Run Wyckoff analysis
        const wyckoff = detectWyckoffPhase(prices);
        const currentPrice = prices[prices.length - 1].close;
        const targets = calculateTargets(
          currentPrice,
          wyckoff.phase,
          wyckoff.support,
          wyckoff.resistance
        );

        // Save analysis
        await sql`
          INSERT INTO wyckoff_analysis (ticker_id, date, phase, sub_phase, strength, target_price, cut_loss_price, support_level, resistance_level, analysis_notes)
          VALUES (${ticker.id}, ${today}, ${wyckoff.phase}, ${wyckoff.subPhase}, ${wyckoff.strength}, ${targets.targetPrice}, ${targets.cutLossPrice}, ${wyckoff.support}, ${wyckoff.resistance}, ${wyckoff.reasoning})
          ON CONFLICT (ticker_id, date) DO UPDATE SET
            phase = EXCLUDED.phase,
            sub_phase = EXCLUDED.sub_phase,
            strength = EXCLUDED.strength,
            target_price = EXCLUDED.target_price,
            cut_loss_price = EXCLUDED.cut_loss_price,
            support_level = EXCLUDED.support_level,
            resistance_level = EXCLUDED.resistance_level,
            analysis_notes = EXCLUDED.analysis_notes
        `;

        console.log(`Completed ${ticker.symbol}: ${wyckoff.phase} (${wyckoff.strength.toFixed(0)}%)`);

        // Rate limit
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Error processing ${ticker.symbol}:`, error);
      }
    }

    console.log('Cron job completed');
  } catch (error) {
    console.error('Cron job error:', error);
    throw error;
  }
}

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(handleCron(env));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    // Allow manual trigger via HTTP
    const url = new URL(request.url);
    if (url.pathname === '/run') {
      try {
        await handleCron(env);
        return new Response('Cron job completed', { status: 200 });
      } catch (error) {
        return new Response(`Error: ${error}`, { status: 500 });
      }
    }

    return new Response('Stock Analysis Cron Worker', { status: 200 });
  }
};
