import type { HistoricalPrice } from '../yahoo';
import type { WyckoffPhase, WyckoffSubPhase } from '../db/schema';
import {
  calculateIndicators,
  identifyTrend,
  analyzeVolume,
  type TechnicalIndicators
} from './indicators';

export interface SupportResistance {
  support: number;
  resistance: number;
  pivotPoints: number[];
}

export interface WyckoffResult {
  phase: WyckoffPhase;
  subPhase: WyckoffSubPhase;
  strength: number; // 0-100
  support: number;
  resistance: number;
  indicators: TechnicalIndicators;
  reasoning: string;
}

// Find key support and resistance levels using pivot points
export function findKeyLevels(prices: HistoricalPrice[]): SupportResistance {
  if (prices.length < 20) {
    const currentPrice = prices[prices.length - 1]?.close || 0;
    return {
      support: currentPrice * 0.95,
      resistance: currentPrice * 1.05,
      pivotPoints: []
    };
  }

  const sortedPrices = [...prices].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const pivots: number[] = [];

  // Find local highs and lows (pivot points)
  for (let i = 2; i < sortedPrices.length - 2; i++) {
    const prev2 = sortedPrices[i - 2];
    const prev1 = sortedPrices[i - 1];
    const curr = sortedPrices[i];
    const next1 = sortedPrices[i + 1];
    const next2 = sortedPrices[i + 2];

    // Local high
    if (
      curr.high > prev1.high &&
      curr.high > prev2.high &&
      curr.high > next1.high &&
      curr.high > next2.high
    ) {
      pivots.push(curr.high);
    }

    // Local low
    if (
      curr.low < prev1.low &&
      curr.low < prev2.low &&
      curr.low < next1.low &&
      curr.low < next2.low
    ) {
      pivots.push(curr.low);
    }
  }

  const currentPrice = sortedPrices[sortedPrices.length - 1].close;

  // Find closest support (below current price)
  const supports = pivots.filter((p) => p < currentPrice).sort((a, b) => b - a);
  const support = supports[0] || currentPrice * 0.95;

  // Find closest resistance (above current price)
  const resistances = pivots.filter((p) => p > currentPrice).sort((a, b) => a - b);
  const resistance = resistances[0] || currentPrice * 1.05;

  return { support, resistance, pivotPoints: pivots };
}

// Detect price consolidation (trading range)
function detectConsolidation(
  prices: HistoricalPrice[],
  lookback: number = 20
): { isConsolidating: boolean; rangePercent: number } {
  if (prices.length < lookback) {
    return { isConsolidating: false, rangePercent: 0 };
  }

  const recent = prices.slice(-lookback);
  const highs = recent.map((p) => p.high);
  const lows = recent.map((p) => p.low);

  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const rangePercent = ((rangeHigh - rangeLow) / rangeLow) * 100;

  // Consider it consolidation if range is less than 15%
  return {
    isConsolidating: rangePercent < 15,
    rangePercent
  };
}

// Check for higher lows pattern (bullish)
function hasHigherLows(prices: HistoricalPrice[], count: number = 3): boolean {
  if (prices.length < count * 5) {
    return false;
  }

  const recentLows: number[] = [];
  const chunkSize = Math.floor(prices.length / count);

  for (let i = 0; i < count; i++) {
    const chunk = prices.slice(i * chunkSize, (i + 1) * chunkSize);
    const minLow = Math.min(...chunk.map((p) => p.low));
    recentLows.push(minLow);
  }

  // Check if lows are increasing
  for (let i = 1; i < recentLows.length; i++) {
    if (recentLows[i] <= recentLows[i - 1]) {
      return false;
    }
  }

  return true;
}

// Check for lower highs pattern (bearish)
function hasLowerHighs(prices: HistoricalPrice[], count: number = 3): boolean {
  if (prices.length < count * 5) {
    return false;
  }

  const recentHighs: number[] = [];
  const chunkSize = Math.floor(prices.length / count);

  for (let i = 0; i < count; i++) {
    const chunk = prices.slice(i * chunkSize, (i + 1) * chunkSize);
    const maxHigh = Math.max(...chunk.map((p) => p.high));
    recentHighs.push(maxHigh);
  }

  // Check if highs are decreasing
  for (let i = 1; i < recentHighs.length; i++) {
    if (recentHighs[i] >= recentHighs[i - 1]) {
      return false;
    }
  }

  return true;
}

// Detect Wyckoff phase
export function detectWyckoffPhase(prices: HistoricalPrice[]): WyckoffResult {
  if (prices.length < 50) {
    const currentPrice = prices[prices.length - 1]?.close || 0;
    return {
      phase: 'accumulation',
      subPhase: 'A',
      strength: 0,
      support: currentPrice * 0.95,
      resistance: currentPrice * 1.05,
      indicators: calculateIndicators(prices),
      reasoning: 'Insufficient data for analysis'
    };
  }

  const sortedPrices = [...prices].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const currentPrice = sortedPrices[sortedPrices.length - 1].close;
  const indicators = calculateIndicators(sortedPrices);
  const { support, resistance } = findKeyLevels(sortedPrices);

  // Analyze trend
  const trend = identifyTrend(
    currentPrice,
    indicators.ma20,
    indicators.ma50,
    indicators.ma200
  );

  // Analyze volume
  const volumePattern = analyzeVolume(sortedPrices);

  // Check for consolidation
  const { isConsolidating, rangePercent } = detectConsolidation(sortedPrices);

  // Check for higher lows / lower highs
  const higherLows = hasHigherLows(sortedPrices);
  const lowerHighs = hasLowerHighs(sortedPrices);

  // Price position relative to levels
  const priceNearSupport = (currentPrice - support) / support < 0.05;
  const priceNearResistance = (resistance - currentPrice) / currentPrice < 0.05;

  // RSI extremes
  const rsiOversold = (indicators.rsi14 || 50) < 30;
  const rsiOverbought = (indicators.rsi14 || 50) > 70;

  // MFI analysis
  const mfiOversold = (indicators.mfi14 || 50) < 30;
  const mfiOverbought = (indicators.mfi14 || 50) > 70;

  // MACD analysis
  const macdBullish =
    indicators.macdHistogram !== null && indicators.macdHistogram > 0;
  const macdBearish =
    indicators.macdHistogram !== null && indicators.macdHistogram < 0;

  let phase: WyckoffPhase;
  let subPhase: WyckoffSubPhase;
  let strength: number;
  let reasoning: string;

  // Phase detection logic
  if (isConsolidating && (priceNearSupport || rsiOversold || mfiOversold)) {
    // ACCUMULATION: Price at lows, consolidating, smart money buying
    phase = 'accumulation';
    strength = 0;
    reasoning = 'Price consolidating near support levels. ';

    if (higherLows) {
      subPhase = 'C'; // Sign of strength
      strength += 30;
      reasoning += 'Higher lows forming. ';
    } else if (volumePattern === 'decreasing') {
      subPhase = 'B'; // Secondary test
      strength += 20;
      reasoning += 'Volume decreasing during consolidation. ';
    } else {
      subPhase = 'A'; // Selling climax
      strength += 10;
      reasoning += 'Initial accumulation phase. ';
    }

    if (rsiOversold) {
      strength += 15;
      reasoning += 'RSI oversold. ';
    }
    if (mfiOversold) {
      strength += 15;
      reasoning += 'MFI shows accumulation. ';
    }
    if (macdBullish) {
      strength += 10;
      reasoning += 'MACD turning bullish. ';
    }
  } else if (trend === 'bullish' && !isConsolidating) {
    // MARKUP: Uptrend after accumulation
    phase = 'markup';
    strength = 0;
    reasoning = 'Price in uptrend above moving averages. ';

    if (indicators.ma20 && indicators.ma50 && indicators.ma20 > indicators.ma50) {
      subPhase = 'D'; // Strong markup
      strength += 25;
      reasoning += 'MA20 above MA50. ';
    } else {
      subPhase = 'C'; // Early markup
      strength += 15;
    }

    if (volumePattern === 'increasing') {
      strength += 20;
      reasoning += 'Volume increasing on up moves. ';
    }
    if (macdBullish) {
      strength += 15;
      reasoning += 'MACD bullish. ';
    }
    if (!rsiOverbought) {
      strength += 10;
      reasoning += 'RSI not yet overbought, room to run. ';
    }
  } else if (isConsolidating && (priceNearResistance || rsiOverbought || mfiOverbought)) {
    // DISTRIBUTION: Price at highs, consolidating, smart money selling
    phase = 'distribution';
    strength = 0;
    reasoning = 'Price consolidating near resistance levels. ';

    if (lowerHighs) {
      subPhase = 'C'; // Sign of weakness
      strength += 30;
      reasoning += 'Lower highs forming. ';
    } else if (volumePattern === 'decreasing') {
      subPhase = 'B'; // Secondary test
      strength += 20;
      reasoning += 'Volume decreasing during consolidation. ';
    } else {
      subPhase = 'A'; // Buying climax
      strength += 10;
      reasoning += 'Initial distribution phase. ';
    }

    if (rsiOverbought) {
      strength += 15;
      reasoning += 'RSI overbought. ';
    }
    if (mfiOverbought) {
      strength += 15;
      reasoning += 'MFI shows distribution. ';
    }
    if (macdBearish) {
      strength += 10;
      reasoning += 'MACD turning bearish. ';
    }
  } else if (trend === 'bearish' && !isConsolidating) {
    // MARKDOWN: Downtrend after distribution
    phase = 'markdown';
    strength = 0;
    reasoning = 'Price in downtrend below moving averages. ';

    if (indicators.ma20 && indicators.ma50 && indicators.ma20 < indicators.ma50) {
      subPhase = 'D'; // Strong markdown
      strength += 25;
      reasoning += 'MA20 below MA50. ';
    } else {
      subPhase = 'C'; // Early markdown
      strength += 15;
    }

    if (volumePattern === 'increasing') {
      strength += 20;
      reasoning += 'Volume increasing on down moves. ';
    }
    if (macdBearish) {
      strength += 15;
      reasoning += 'MACD bearish. ';
    }
    if (!rsiOversold) {
      strength += 10;
      reasoning += 'RSI not yet oversold, more downside possible. ';
    }
  } else {
    // Default to accumulation if unclear
    phase = 'accumulation';
    subPhase = 'A';
    strength = 25;
    reasoning = 'Market in transition, monitoring for clearer signals. ';
  }

  // Cap strength at 100
  strength = Math.min(100, strength);

  return {
    phase,
    subPhase,
    strength,
    support,
    resistance,
    indicators,
    reasoning: reasoning.trim()
  };
}
