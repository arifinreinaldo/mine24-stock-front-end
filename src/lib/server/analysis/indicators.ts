import type { HistoricalPrice } from '../yahoo';

export interface TechnicalIndicators {
  ma20: number | null;
  ma50: number | null;
  ma200: number | null;
  rsi14: number | null;
  mfi14: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  volumeAvg20: number | null;
  volumeRatio: number | null;
}

// Calculate Simple Moving Average
export function calculateSMA(prices: number[], period: number): number | null {
  if (prices.length < period) {
    return null;
  }
  const slice = prices.slice(-period);
  return slice.reduce((sum, p) => sum + p, 0) / period;
}

// Calculate Exponential Moving Average
export function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  const ema: number[] = [];

  // Start with SMA for the first EMA value
  const firstSMA = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;
  ema.push(firstSMA);

  // Calculate EMA for remaining values
  for (let i = period; i < prices.length; i++) {
    const value = (prices[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
    ema.push(value);
  }

  return ema;
}

// Calculate RSI (Relative Strength Index)
export function calculateRSI(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) {
    return null;
  }

  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  // Calculate initial average gain and loss
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) {
      avgGain += changes[i];
    } else {
      avgLoss += Math.abs(changes[i]);
    }
  }
  avgGain /= period;
  avgLoss /= period;

  // Calculate RSI using smoothed averages
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

  if (avgLoss === 0) {
    return 100;
  }

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// Calculate MFI (Money Flow Index)
export function calculateMFI(
  prices: HistoricalPrice[],
  period: number = 14
): number | null {
  if (prices.length < period + 1) {
    return null;
  }

  // Calculate typical price and raw money flow
  const typicalPrices = prices.map((p) => (p.high + p.low + p.close) / 3);
  const rawMoneyFlow = prices.map((p, i) => typicalPrices[i] * p.volume);

  let positiveFlow = 0;
  let negativeFlow = 0;

  // Calculate positive and negative money flow for the period
  for (let i = prices.length - period; i < prices.length; i++) {
    if (typicalPrices[i] > typicalPrices[i - 1]) {
      positiveFlow += rawMoneyFlow[i];
    } else if (typicalPrices[i] < typicalPrices[i - 1]) {
      negativeFlow += rawMoneyFlow[i];
    }
  }

  if (negativeFlow === 0) {
    return 100;
  }

  const moneyFlowRatio = positiveFlow / negativeFlow;
  return 100 - 100 / (1 + moneyFlowRatio);
}

// Calculate MACD
export function calculateMACD(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macdLine: number | null; signal: number | null; histogram: number | null } {
  if (prices.length < slowPeriod + signalPeriod) {
    return { macdLine: null, signal: null, histogram: null };
  }

  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);

  if (fastEMA.length === 0 || slowEMA.length === 0) {
    return { macdLine: null, signal: null, histogram: null };
  }

  // Calculate MACD line (Fast EMA - Slow EMA)
  // Align the arrays
  const offset = fastPeriod - slowPeriod + slowPeriod - 1;
  const macdValues: number[] = [];

  for (let i = 0; i < slowEMA.length; i++) {
    const fastIdx = i + (slowPeriod - fastPeriod);
    if (fastIdx >= 0 && fastIdx < fastEMA.length) {
      macdValues.push(fastEMA[fastIdx] - slowEMA[i]);
    }
  }

  if (macdValues.length < signalPeriod) {
    return { macdLine: null, signal: null, histogram: null };
  }

  // Calculate signal line (EMA of MACD)
  const signalEMA = calculateEMA(macdValues, signalPeriod);

  const macdLine = macdValues[macdValues.length - 1];
  const signal = signalEMA.length > 0 ? signalEMA[signalEMA.length - 1] : null;
  const histogram = signal !== null ? macdLine - signal : null;

  return { macdLine, signal, histogram };
}

// Calculate all technical indicators for a given price history
export function calculateIndicators(prices: HistoricalPrice[]): TechnicalIndicators {
  if (prices.length === 0) {
    return {
      ma20: null,
      ma50: null,
      ma200: null,
      rsi14: null,
      mfi14: null,
      macdLine: null,
      macdSignal: null,
      macdHistogram: null,
      volumeAvg20: null,
      volumeRatio: null
    };
  }

  // Sort by date ascending
  const sortedPrices = [...prices].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const closes = sortedPrices.map((p) => p.close);
  const volumes = sortedPrices.map((p) => p.volume);

  // Calculate MAs
  const ma20 = calculateSMA(closes, 20);
  const ma50 = calculateSMA(closes, 50);
  const ma200 = calculateSMA(closes, 200);

  // Calculate RSI
  const rsi14 = calculateRSI(closes, 14);

  // Calculate MFI
  const mfi14 = calculateMFI(sortedPrices, 14);

  // Calculate MACD
  const macd = calculateMACD(closes);

  // Calculate volume metrics
  const volumeAvg20 = volumes.length >= 20
    ? Math.round(volumes.slice(-20).reduce((sum, v) => sum + v, 0) / 20)
    : null;
  const currentVolume = volumes[volumes.length - 1];
  const volumeRatio = volumeAvg20 ? currentVolume / volumeAvg20 : null;

  return {
    ma20,
    ma50,
    ma200,
    rsi14,
    mfi14,
    macdLine: macd.macdLine,
    macdSignal: macd.signal,
    macdHistogram: macd.histogram,
    volumeAvg20,
    volumeRatio
  };
}

// Identify trend based on moving averages
export function identifyTrend(
  currentPrice: number,
  ma20: number | null,
  ma50: number | null,
  ma200: number | null
): 'bullish' | 'bearish' | 'neutral' {
  if (!ma20 || !ma50) {
    return 'neutral';
  }

  const aboveMa20 = currentPrice > ma20;
  const aboveMa50 = currentPrice > ma50;
  const aboveMa200 = ma200 ? currentPrice > ma200 : null;
  const ma20AboveMa50 = ma20 > ma50;

  // Bullish: Price above MA20 and MA50, and MA20 > MA50
  if (aboveMa20 && aboveMa50 && ma20AboveMa50) {
    return 'bullish';
  }

  // Bearish: Price below MA20 and MA50, and MA20 < MA50
  if (!aboveMa20 && !aboveMa50 && !ma20AboveMa50) {
    return 'bearish';
  }

  return 'neutral';
}

// Analyze volume pattern
export function analyzeVolume(
  prices: HistoricalPrice[],
  lookback: number = 20
): 'increasing' | 'decreasing' | 'stable' {
  if (prices.length < lookback) {
    return 'stable';
  }

  const recentPrices = prices.slice(-lookback);
  const firstHalf = recentPrices.slice(0, Math.floor(lookback / 2));
  const secondHalf = recentPrices.slice(Math.floor(lookback / 2));

  const firstHalfAvg = firstHalf.reduce((sum, p) => sum + p.volume, 0) / firstHalf.length;
  const secondHalfAvg = secondHalf.reduce((sum, p) => sum + p.volume, 0) / secondHalf.length;

  const changePercent = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;

  if (changePercent > 20) {
    return 'increasing';
  } else if (changePercent < -20) {
    return 'decreasing';
  }
  return 'stable';
}
