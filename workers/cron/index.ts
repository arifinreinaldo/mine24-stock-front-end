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

type WyckoffPhase = 'accumulation' | 'markup' | 'distribution' | 'markdown';
type WyckoffSubPhase = 'A' | 'B' | 'C' | 'D' | 'E';

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

// Calculate Simple Moving Average
function calculateSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((sum, p) => sum + p, 0) / period;
}

// Calculate RSI
function calculateRSI(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) return null;

  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// Calculate EMA
function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [];
  const multiplier = 2 / (period + 1);
  const ema: number[] = [];
  const firstSMA = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;
  ema.push(firstSMA);
  for (let i = period; i < prices.length; i++) {
    const value = (prices[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
    ema.push(value);
  }
  return ema;
}

// Calculate MACD
function calculateMACD(prices: number[]): { histogram: number | null } {
  if (prices.length < 35) return { histogram: null };
  
  const fastEMA = calculateEMA(prices, 12);
  const slowEMA = calculateEMA(prices, 26);
  
  if (fastEMA.length === 0 || slowEMA.length === 0) return { histogram: null };
  
  const macdValues: number[] = [];
  for (let i = 0; i < slowEMA.length; i++) {
    const fastIdx = i + (26 - 12);
    if (fastIdx >= 0 && fastIdx < fastEMA.length) {
      macdValues.push(fastEMA[fastIdx] - slowEMA[i]);
    }
  }
  
  if (macdValues.length < 9) return { histogram: null };
  
  const signalEMA = calculateEMA(macdValues, 9);
  const macdLine = macdValues[macdValues.length - 1];
  const signal = signalEMA.length > 0 ? signalEMA[signalEMA.length - 1] : null;
  
  return { histogram: signal !== null ? macdLine - signal : null };
}

// Check for lower highs pattern
function hasLowerHighs(prices: HistoricalPrice[], count: number = 3): boolean {
  if (prices.length < count * 5) return false;
  
  const recentHighs: number[] = [];
  const chunkSize = Math.floor(prices.length / count);
  
  for (let i = 0; i < count; i++) {
    const chunk = prices.slice(i * chunkSize, (i + 1) * chunkSize);
    recentHighs.push(Math.max(...chunk.map(p => p.high)));
  }
  
  for (let i = 1; i < recentHighs.length; i++) {
    if (recentHighs[i] >= recentHighs[i - 1]) return false;
  }
  return true;
}

// Check for higher lows pattern
function hasHigherLows(prices: HistoricalPrice[], count: number = 3): boolean {
  if (prices.length < count * 5) return false;
  
  const recentLows: number[] = [];
  const chunkSize = Math.floor(prices.length / count);
  
  for (let i = 0; i < count; i++) {
    const chunk = prices.slice(i * chunkSize, (i + 1) * chunkSize);
    recentLows.push(Math.min(...chunk.map(p => p.low)));
  }
  
  for (let i = 1; i < recentLows.length; i++) {
    if (recentLows[i] <= recentLows[i - 1]) return false;
  }
  return true;
}

// Detect consolidation
function detectConsolidation(prices: HistoricalPrice[], lookback: number = 20): boolean {
  if (prices.length < lookback) return false;
  
  const recent = prices.slice(-lookback);
  const rangeHigh = Math.max(...recent.map(p => p.high));
  const rangeLow = Math.min(...recent.map(p => p.low));
  const rangePercent = ((rangeHigh - rangeLow) / rangeLow) * 100;
  
  return rangePercent < 15;
}

// Improved Wyckoff detection matching main app logic
function detectWyckoffPhase(prices: HistoricalPrice[]): {
  phase: WyckoffPhase;
  subPhase: WyckoffSubPhase;
  strength: number;
  support: number;
  resistance: number;
  reasoning: string;
  ma20: number | null;
  ma50: number | null;
  ma200: number | null;
  rsi14: number | null;
  macdHistogram: number | null;
} {
  if (prices.length < 50) {
    const currentPrice = prices[prices.length - 1]?.close || 0;
    return {
      phase: 'accumulation',
      subPhase: 'A',
      strength: 0,
      support: currentPrice * 0.95,
      resistance: currentPrice * 1.05,
      reasoning: 'Insufficient data',
      ma20: null, ma50: null, ma200: null, rsi14: null, macdHistogram: null
    };
  }

  // Sort by date
  const sortedPrices = [...prices].sort((a, b) => a.date.getTime() - b.date.getTime());
  const closes = sortedPrices.map(p => p.close);
  const currentPrice = closes[closes.length - 1];

  // Calculate indicators
  const ma20 = calculateSMA(closes, 20);
  const ma50 = calculateSMA(closes, 50);
  const ma200 = calculateSMA(closes, 200);
  const rsi14 = calculateRSI(closes, 14);
  const macd = calculateMACD(closes);

  // Find support/resistance from recent 50 days
  const recent50 = sortedPrices.slice(-50);
  const recentHigh = Math.max(...recent50.map(p => p.high));
  const recentLow = Math.min(...recent50.map(p => p.low));
  const priceRange = recentHigh - recentLow;
  const pricePosition = priceRange > 0 ? (currentPrice - recentLow) / priceRange : 0.5;

  // Price position flags
  const priceInUpperRange = pricePosition > 0.7;
  const priceInLowerRange = pricePosition < 0.3;

  // Pattern detection
  const lowerHighs = hasLowerHighs(sortedPrices);
  const higherLows = hasHigherLows(sortedPrices);
  const isConsolidating = detectConsolidation(sortedPrices);

  // Indicator flags
  const rsiOversold = (rsi14 || 50) < 30;
  const rsiOverbought = (rsi14 || 50) > 70;
  const macdBullish = macd.histogram !== null && macd.histogram > 0;
  const macdBearish = macd.histogram !== null && macd.histogram < 0;

  // Trend detection
  const isDowntrending = lowerHighs || 
    (ma20 && ma50 && currentPrice < ma20 && currentPrice < ma50 && ma20 < ma50);
  const isUptrending = higherLows ||
    (ma20 && ma50 && currentPrice > ma20 && currentPrice > ma50 && ma20 > ma50);

  // Calculate drop from high
  const dropFromHigh = recentHigh > 0 ? ((recentHigh - currentPrice) / recentHigh) * 100 : 0;

  let phase: WyckoffPhase;
  let subPhase: WyckoffSubPhase;
  let strength = 0;
  let reasoning = '';

  // Phase detection logic (matching main app)
  if (isDowntrending && !isConsolidating) {
    phase = 'markdown';
    reasoning = 'Price in downtrend. ';

    if (dropFromHigh > 40 || (rsiOversold && priceInLowerRange)) {
      subPhase = 'E';
      strength = 35;
      reasoning += `Price dropped ${dropFromHigh.toFixed(0)}% from high. Potential capitulation. `;
    } else if (dropFromHigh > 25 || (ma20 && ma50 && ma20 < ma50 && lowerHighs)) {
      subPhase = 'D';
      strength = 30;
      reasoning += 'Confirmed downtrend with death cross. ';
    } else if (ma20 && ma50 && ma20 < ma50) {
      subPhase = 'C';
      strength = 25;
      reasoning += 'MA20 crossed below MA50. ';
    } else if (lowerHighs) {
      subPhase = 'B';
      strength = 20;
      reasoning += 'Lower highs forming. ';
    } else {
      subPhase = 'A';
      strength = 15;
      reasoning += 'Early markdown phase. ';
    }

    if (lowerHighs && subPhase !== 'B') strength += 15;
    if (macdBearish) strength += 10;
    if (rsiOversold) strength += 5;

  } else if (isConsolidating && (priceInUpperRange || rsiOverbought || lowerHighs)) {
    phase = 'distribution';
    reasoning = 'Price consolidating near highs. ';

    if (lowerHighs && macdBearish && ma20 && currentPrice < ma20) {
      subPhase = 'E';
      strength = 35;
      reasoning += 'Last point of supply, breakdown imminent. ';
    } else if (lowerHighs && macdBearish) {
      subPhase = 'D';
      strength = 30;
      reasoning += 'Sign of weakness with bearish momentum. ';
    } else if (lowerHighs) {
      subPhase = 'C';
      strength = 25;
      reasoning += 'Lower highs forming. ';
    } else {
      subPhase = 'B';
      strength = 20;
      reasoning += 'Secondary test phase. ';
    }

    if (rsiOverbought) strength += 15;
    if (macdBearish && subPhase !== 'D' && subPhase !== 'E') strength += 10;

  } else if (isUptrending && !isConsolidating) {
    phase = 'markup';
    reasoning = 'Price in uptrend above moving averages. ';

    if (ma20 && ma50 && ma20 > ma50) {
      subPhase = 'D';
      strength = 30;
      reasoning += 'MA20 above MA50. ';
    } else {
      subPhase = 'C';
      strength = 20;
      reasoning += 'Early markup phase. ';
    }

    if (higherLows) strength += 20;
    if (macdBullish) strength += 15;
    if (!rsiOverbought) strength += 10;

  } else if (isConsolidating && (priceInLowerRange || rsiOversold || higherLows)) {
    phase = 'accumulation';
    reasoning = 'Price consolidating near support levels. ';

    if (higherLows) {
      subPhase = 'C';
      strength = 30;
      reasoning += 'Higher lows forming - sign of strength. ';
    } else {
      subPhase = 'B';
      strength = 20;
      reasoning += 'Secondary test phase. ';
    }

    if (rsiOversold) strength += 15;
    if (macdBullish) strength += 10;

  } else {
    // Fallback based on indicators
    if (priceInLowerRange || rsiOversold) {
      phase = 'accumulation';
      subPhase = 'A';
      strength = 20;
      reasoning = 'Price near lows, potential accumulation. ';
    } else if (priceInUpperRange || rsiOverbought) {
      phase = 'distribution';
      subPhase = 'A';
      strength = 20;
      reasoning = 'Price near highs, potential distribution. ';
    } else if (macdBearish && ma20 && currentPrice < ma20) {
      phase = 'markdown';
      subPhase = 'C';
      strength = 20;
      reasoning = 'Bearish momentum, potential markdown. ';
    } else if (macdBullish && ma20 && currentPrice > ma20) {
      phase = 'markup';
      subPhase = 'C';
      strength = 20;
      reasoning = 'Bullish momentum, potential markup. ';
    } else {
      phase = 'accumulation';
      subPhase = 'A';
      strength = 15;
      reasoning = 'Market in transition. ';
    }
  }

  return {
    phase,
    subPhase,
    strength: Math.min(100, strength),
    support: recentLow,
    resistance: recentHigh,
    reasoning: reasoning.trim(),
    ma20,
    ma50,
    ma200,
    rsi14,
    macdHistogram: macd.histogram
  };
}

// Calculate target and cut loss
function calculateTargets(
  currentPrice: number,
  phase: string,
  support: number,
  resistance: number,
  ma20: number | null,
  ma50: number | null
): { targetPrice: number; cutLossPrice: number } {
  switch (phase) {
    case 'accumulation':
      return {
        targetPrice: resistance * 1.05,
        cutLossPrice: Math.max(support * 0.97, currentPrice * 0.92)
      };
    case 'markup':
      return {
        targetPrice: currentPrice * 1.18,
        cutLossPrice: ma20 ? Math.max(ma20 * 0.98, currentPrice * 0.92) : currentPrice * 0.92
      };
    case 'distribution':
      return {
        targetPrice: support,
        cutLossPrice: resistance * 1.03
      };
    case 'markdown':
      return {
        targetPrice: support * 0.95,
        cutLossPrice: ma20 ? Math.min(ma20 * 1.02, currentPrice * 1.08) : currentPrice * 1.08
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
          wyckoff.resistance,
          wyckoff.ma20,
          wyckoff.ma50
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

        // Save metrics
        await sql`
          INSERT INTO metrics_daily (ticker_id, date, ma_20, ma_50, ma_200, rsi_14, macd_histogram)
          VALUES (${ticker.id}, ${today}, ${wyckoff.ma20}, ${wyckoff.ma50}, ${wyckoff.ma200}, ${wyckoff.rsi14}, ${wyckoff.macdHistogram})
          ON CONFLICT (ticker_id, date) DO UPDATE SET
            ma_20 = EXCLUDED.ma_20,
            ma_50 = EXCLUDED.ma_50,
            ma_200 = EXCLUDED.ma_200,
            rsi_14 = EXCLUDED.rsi_14,
            macd_histogram = EXCLUDED.macd_histogram
        `;

        console.log(`Completed ${ticker.symbol}: ${wyckoff.phase} ${wyckoff.subPhase} (${wyckoff.strength}%)`);

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
