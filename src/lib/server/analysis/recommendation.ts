import type { WyckoffPhase } from '$lib/server/db/schema';

export type RecommendationAction = 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';

export interface StockRecommendation {
  action: RecommendationAction;
  confidence: number; // 0-100
  entryPriceMin: number;
  entryPriceMax: number;
  targetPrice: number;
  stopLoss: number;
  riskRewardRatio: number;
  factors: RecommendationFactor[];
  summary: string;
}

export interface RecommendationFactor {
  name: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  description: string;
  weight: number; // How much this factor contributed
}

interface RecommendationInput {
  currentPrice: number;
  phase: WyckoffPhase;
  subPhase: string | null;
  strength: number;
  targetPrice: number;
  cutLossPrice: number;
  support: number;
  resistance: number;
  ma200: number | null;
  rsi14: number | null;
  foreignNetFlow: number | null; // Recent net foreign flow (positive = buying)
  marketBreadthPercent: number | null; // % of stocks above MA200
}

/**
 * Generate a stock recommendation based on multiple factors
 */
export function generateRecommendation(input: RecommendationInput): StockRecommendation {
  const factors: RecommendationFactor[] = [];
  let score = 0; // -100 to +100
  let totalWeight = 0;

  // Factor 1: Wyckoff Phase (weight: 30)
  const phaseWeight = 30;
  totalWeight += phaseWeight;
  const phaseFactor = analyzePhase(input.phase, input.subPhase, input.strength);
  factors.push(phaseFactor);
  score += phaseFactor.weight * (phaseFactor.signal === 'bullish' ? 1 : phaseFactor.signal === 'bearish' ? -1 : 0);

  // Factor 2: Price vs MA200 (weight: 20)
  if (input.ma200 !== null) {
    const ma200Weight = 20;
    totalWeight += ma200Weight;
    const ma200Factor = analyzeMA200(input.currentPrice, input.ma200);
    factors.push(ma200Factor);
    score += ma200Factor.weight * (ma200Factor.signal === 'bullish' ? 1 : ma200Factor.signal === 'bearish' ? -1 : 0);
  }

  // Factor 3: RSI (weight: 15)
  if (input.rsi14 !== null) {
    const rsiWeight = 15;
    totalWeight += rsiWeight;
    const rsiFactor = analyzeRSI(input.rsi14);
    factors.push(rsiFactor);
    score += rsiFactor.weight * (rsiFactor.signal === 'bullish' ? 1 : rsiFactor.signal === 'bearish' ? -1 : 0);
  }

  // Factor 4: Foreign Flow (weight: 15)
  if (input.foreignNetFlow !== null) {
    const flowWeight = 15;
    totalWeight += flowWeight;
    const flowFactor = analyzeForeignFlow(input.foreignNetFlow);
    factors.push(flowFactor);
    score += flowFactor.weight * (flowFactor.signal === 'bullish' ? 1 : flowFactor.signal === 'bearish' ? -1 : 0);
  }

  // Factor 5: Market Breadth (weight: 10)
  if (input.marketBreadthPercent !== null) {
    const breadthWeight = 10;
    totalWeight += breadthWeight;
    const breadthFactor = analyzeMarketBreadth(input.marketBreadthPercent);
    factors.push(breadthFactor);
    score += breadthFactor.weight * (breadthFactor.signal === 'bullish' ? 1 : breadthFactor.signal === 'bearish' ? -1 : 0);
  }

  // Factor 6: Risk/Reward from Support/Resistance (weight: 10)
  const rrWeight = 10;
  totalWeight += rrWeight;
  const rrFactor = analyzeRiskReward(input.currentPrice, input.support, input.resistance, input.targetPrice, input.cutLossPrice);
  factors.push(rrFactor);
  score += rrFactor.weight * (rrFactor.signal === 'bullish' ? 1 : rrFactor.signal === 'bearish' ? -1 : 0);

  // Normalize score to -100 to +100
  const normalizedScore = totalWeight > 0 ? (score / totalWeight) * 100 : 0;

  // Determine action based on score
  const action = scoreToAction(normalizedScore);

  // Calculate confidence (how strong the signals are)
  const confidence = Math.min(100, Math.abs(normalizedScore) + 20);

  // Calculate entry price range
  const { entryPriceMin, entryPriceMax } = calculateEntryRange(
    input.currentPrice,
    input.support,
    input.phase,
    action
  );

  // Calculate risk/reward ratio
  const potentialGain = input.targetPrice - input.currentPrice;
  const potentialLoss = input.currentPrice - input.cutLossPrice;
  const riskRewardRatio = potentialLoss > 0 ? potentialGain / potentialLoss : 0;

  // Generate summary
  const summary = generateSummary(action, input.phase, factors, riskRewardRatio);

  return {
    action,
    confidence: Math.round(confidence),
    entryPriceMin,
    entryPriceMax,
    targetPrice: input.targetPrice,
    stopLoss: input.cutLossPrice,
    riskRewardRatio: Math.round(riskRewardRatio * 100) / 100,
    factors,
    summary
  };
}

function analyzePhase(phase: WyckoffPhase, subPhase: string | null, strength: number): RecommendationFactor {
  const weight = 30;

  switch (phase) {
    case 'accumulation':
      if (subPhase === 'C' || subPhase === 'D') {
        return {
          name: 'Wyckoff Phase',
          signal: 'bullish',
          description: `Accumulation Phase ${subPhase || ''} - Smart money buying, breakout potential`,
          weight
        };
      }
      return {
        name: 'Wyckoff Phase',
        signal: 'bullish',
        description: `Accumulation Phase - Building base for potential uptrend`,
        weight: weight * 0.7
      };

    case 'markup':
      return {
        name: 'Wyckoff Phase',
        signal: 'bullish',
        description: `Markup Phase - Active uptrend, momentum in favor`,
        weight: weight * (strength > 60 ? 1 : 0.8)
      };

    case 'distribution':
      if (subPhase === 'C' || subPhase === 'D') {
        return {
          name: 'Wyckoff Phase',
          signal: 'bearish',
          description: `Distribution Phase ${subPhase || ''} - Smart money selling, breakdown risk`,
          weight
        };
      }
      return {
        name: 'Wyckoff Phase',
        signal: 'bearish',
        description: `Distribution Phase - Topping pattern, be cautious`,
        weight: weight * 0.7
      };

    case 'markdown':
      return {
        name: 'Wyckoff Phase',
        signal: 'bearish',
        description: `Markdown Phase - Active downtrend, avoid buying`,
        weight
      };

    default:
      return {
        name: 'Wyckoff Phase',
        signal: 'neutral',
        description: 'Phase unclear',
        weight: 0
      };
  }
}

function analyzeMA200(currentPrice: number, ma200: number): RecommendationFactor {
  const percentAbove = ((currentPrice - ma200) / ma200) * 100;

  if (percentAbove > 10) {
    return {
      name: 'MA200 Trend',
      signal: 'bullish',
      description: `Price ${percentAbove.toFixed(1)}% above MA200 - Strong uptrend`,
      weight: 20
    };
  } else if (percentAbove > 0) {
    return {
      name: 'MA200 Trend',
      signal: 'bullish',
      description: `Price ${percentAbove.toFixed(1)}% above MA200 - Uptrend intact`,
      weight: 15
    };
  } else if (percentAbove > -10) {
    return {
      name: 'MA200 Trend',
      signal: 'bearish',
      description: `Price ${Math.abs(percentAbove).toFixed(1)}% below MA200 - Downtrend`,
      weight: 15
    };
  } else {
    return {
      name: 'MA200 Trend',
      signal: 'bearish',
      description: `Price ${Math.abs(percentAbove).toFixed(1)}% below MA200 - Strong downtrend`,
      weight: 20
    };
  }
}

function analyzeRSI(rsi: number): RecommendationFactor {
  if (rsi < 30) {
    return {
      name: 'RSI Momentum',
      signal: 'bullish',
      description: `RSI ${rsi.toFixed(0)} - Oversold, potential bounce`,
      weight: 15
    };
  } else if (rsi < 45) {
    return {
      name: 'RSI Momentum',
      signal: 'neutral',
      description: `RSI ${rsi.toFixed(0)} - Weak momentum`,
      weight: 5
    };
  } else if (rsi < 55) {
    return {
      name: 'RSI Momentum',
      signal: 'neutral',
      description: `RSI ${rsi.toFixed(0)} - Neutral momentum`,
      weight: 0
    };
  } else if (rsi < 70) {
    return {
      name: 'RSI Momentum',
      signal: 'bullish',
      description: `RSI ${rsi.toFixed(0)} - Strong momentum`,
      weight: 10
    };
  } else {
    return {
      name: 'RSI Momentum',
      signal: 'bearish',
      description: `RSI ${rsi.toFixed(0)} - Overbought, pullback risk`,
      weight: 15
    };
  }
}

function analyzeForeignFlow(netFlow: number): RecommendationFactor {
  // netFlow is in shares, convert to millions for display
  const flowInMillions = netFlow / 1_000_000;

  if (netFlow > 1_000_000) {
    return {
      name: 'Foreign Flow',
      signal: 'bullish',
      description: `Net foreign buying +${flowInMillions.toFixed(1)}M shares`,
      weight: 15
    };
  } else if (netFlow > 0) {
    return {
      name: 'Foreign Flow',
      signal: 'bullish',
      description: `Slight foreign buying +${(netFlow / 1000).toFixed(0)}K shares`,
      weight: 8
    };
  } else if (netFlow > -1_000_000) {
    return {
      name: 'Foreign Flow',
      signal: 'bearish',
      description: `Slight foreign selling ${(netFlow / 1000).toFixed(0)}K shares`,
      weight: 8
    };
  } else {
    return {
      name: 'Foreign Flow',
      signal: 'bearish',
      description: `Net foreign selling ${flowInMillions.toFixed(1)}M shares`,
      weight: 15
    };
  }
}

function analyzeMarketBreadth(percentAboveMA200: number): RecommendationFactor {
  if (percentAboveMA200 >= 70) {
    return {
      name: 'Market Breadth',
      signal: 'bullish',
      description: `${percentAboveMA200}% of stocks above MA200 - Strong market`,
      weight: 10
    };
  } else if (percentAboveMA200 >= 50) {
    return {
      name: 'Market Breadth',
      signal: 'bullish',
      description: `${percentAboveMA200}% of stocks above MA200 - Healthy market`,
      weight: 7
    };
  } else if (percentAboveMA200 >= 30) {
    return {
      name: 'Market Breadth',
      signal: 'bearish',
      description: `${percentAboveMA200}% of stocks above MA200 - Weak market`,
      weight: 7
    };
  } else {
    return {
      name: 'Market Breadth',
      signal: 'bearish',
      description: `${percentAboveMA200}% of stocks above MA200 - Bear market`,
      weight: 10
    };
  }
}

function analyzeRiskReward(
  currentPrice: number,
  support: number,
  resistance: number,
  targetPrice: number,
  cutLossPrice: number
): RecommendationFactor {
  const potentialGain = targetPrice - currentPrice;
  const potentialLoss = currentPrice - cutLossPrice;
  const rr = potentialLoss > 0 ? potentialGain / potentialLoss : 0;

  // Also check proximity to support/resistance
  const distanceToSupport = ((currentPrice - support) / currentPrice) * 100;
  const distanceToResistance = ((resistance - currentPrice) / currentPrice) * 100;

  if (rr >= 3 && distanceToSupport < 5) {
    return {
      name: 'Risk/Reward',
      signal: 'bullish',
      description: `R:R ${rr.toFixed(1)}:1, near support - Excellent entry`,
      weight: 10
    };
  } else if (rr >= 2) {
    return {
      name: 'Risk/Reward',
      signal: 'bullish',
      description: `R:R ${rr.toFixed(1)}:1 - Favorable setup`,
      weight: 8
    };
  } else if (rr >= 1) {
    return {
      name: 'Risk/Reward',
      signal: 'neutral',
      description: `R:R ${rr.toFixed(1)}:1 - Acceptable but not ideal`,
      weight: 3
    };
  } else {
    return {
      name: 'Risk/Reward',
      signal: 'bearish',
      description: `R:R ${rr.toFixed(1)}:1 - Poor risk/reward`,
      weight: 10
    };
  }
}

function scoreToAction(score: number): RecommendationAction {
  if (score >= 50) return 'STRONG_BUY';
  if (score >= 20) return 'BUY';
  if (score >= -20) return 'HOLD';
  if (score >= -50) return 'SELL';
  return 'STRONG_SELL';
}

function calculateEntryRange(
  currentPrice: number,
  support: number,
  phase: WyckoffPhase,
  action: RecommendationAction
): { entryPriceMin: number; entryPriceMax: number } {
  // For buy recommendations, suggest entry near support or current price
  if (action === 'STRONG_BUY' || action === 'BUY') {
    // Entry range: support level to slightly above current price
    const buffer = currentPrice * 0.02; // 2% buffer
    return {
      entryPriceMin: Math.max(support, currentPrice - buffer),
      entryPriceMax: currentPrice + buffer
    };
  }

  // For hold, entry at current level if already holding
  if (action === 'HOLD') {
    return {
      entryPriceMin: currentPrice * 0.98,
      entryPriceMax: currentPrice * 1.02
    };
  }

  // For sell recommendations, no entry suggested
  return {
    entryPriceMin: 0,
    entryPriceMax: 0
  };
}

function generateSummary(
  action: RecommendationAction,
  phase: WyckoffPhase,
  factors: RecommendationFactor[],
  riskRewardRatio: number
): string {
  const bullishFactors = factors.filter(f => f.signal === 'bullish').length;
  const bearishFactors = factors.filter(f => f.signal === 'bearish').length;

  switch (action) {
    case 'STRONG_BUY':
      return `Strong buying opportunity. ${bullishFactors} bullish signals align with ${phase} phase. Favorable R:R of ${riskRewardRatio.toFixed(1)}:1.`;

    case 'BUY':
      return `Consider buying. ${bullishFactors} bullish signals support entry. Wait for pullback to support for better entry.`;

    case 'HOLD':
      return `Mixed signals. ${bullishFactors} bullish vs ${bearishFactors} bearish factors. Hold existing positions, avoid new entries.`;

    case 'SELL':
      return `Consider reducing position. ${bearishFactors} bearish signals suggest caution. Take partial profits.`;

    case 'STRONG_SELL':
      return `Exit recommended. ${bearishFactors} bearish signals with ${phase} phase indicate high risk. Preserve capital.`;

    default:
      return 'Unable to generate recommendation.';
  }
}
