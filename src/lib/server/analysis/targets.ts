import type { WyckoffPhase } from '../db/schema';

export interface TargetCalculation {
  targetPrice: number;
  cutLossPrice: number;
  riskRewardRatio: number;
  potentialGainPercent: number;
  potentialLossPercent: number;
}

// Calculate target price and cut loss based on Wyckoff phase
export function calculateTargetAndCutLoss(
  currentPrice: number,
  phase: WyckoffPhase,
  support: number,
  resistance: number,
  ma20?: number | null,
  ma50?: number | null
): TargetCalculation {
  let targetPrice: number;
  let cutLossPrice: number;

  switch (phase) {
    case 'accumulation':
      // Target: Above resistance (breakout target)
      // Measured move: Range height added to breakout point
      const accRange = resistance - support;
      targetPrice = resistance + accRange * 0.5; // 50% of range as target above resistance

      // Cut loss: Below support with buffer
      cutLossPrice = support * 0.97; // 3% below support
      break;

    case 'markup':
      // Target: Use Fibonacci extensions or percentage target
      // During markup, aim for 15-25% gains from current price
      targetPrice = currentPrice * 1.18; // 18% upside target

      // Cut loss: Below MA20 or 8% below current price, whichever is higher
      const markupCutLoss1 = ma20 ? ma20 * 0.98 : currentPrice * 0.92;
      const markupCutLoss2 = currentPrice * 0.92;
      cutLossPrice = Math.max(markupCutLoss1, markupCutLoss2);
      break;

    case 'distribution':
      // In distribution, we're looking for shorts or exits
      // Target: Below support (breakdown target)
      const distRange = resistance - support;
      targetPrice = support - distRange * 0.5; // Target below support

      // Cut loss: Above resistance
      cutLossPrice = resistance * 1.03; // 3% above resistance
      break;

    case 'markdown':
      // Target: Further downside using measured moves
      targetPrice = currentPrice * 0.82; // 18% downside target

      // Cut loss: Above MA20 or 8% above current price
      const mdCutLoss1 = ma20 ? ma20 * 1.02 : currentPrice * 1.08;
      const mdCutLoss2 = currentPrice * 1.08;
      cutLossPrice = Math.min(mdCutLoss1, mdCutLoss2);
      break;

    default:
      targetPrice = currentPrice * 1.10;
      cutLossPrice = currentPrice * 0.95;
  }

  // Calculate metrics
  const potentialGainPercent = ((targetPrice - currentPrice) / currentPrice) * 100;
  const potentialLossPercent = ((currentPrice - cutLossPrice) / currentPrice) * 100;

  // For bearish phases, flip the calculation
  const absGain = Math.abs(potentialGainPercent);
  const absLoss = Math.abs(potentialLossPercent);

  const riskRewardRatio = absLoss > 0 ? absGain / absLoss : 0;

  return {
    targetPrice: Math.round(targetPrice * 100) / 100, // Round to 2 decimals
    cutLossPrice: Math.round(cutLossPrice * 100) / 100,
    riskRewardRatio: Math.round(riskRewardRatio * 100) / 100,
    potentialGainPercent: Math.round(potentialGainPercent * 100) / 100,
    potentialLossPercent: Math.round(potentialLossPercent * 100) / 100
  };
}

// Calculate position size based on risk management
export function calculatePositionSize(
  accountSize: number,
  riskPercentage: number,
  entryPrice: number,
  cutLossPrice: number
): { shares: number; positionValue: number; riskAmount: number } {
  const riskAmount = accountSize * (riskPercentage / 100);
  const riskPerShare = Math.abs(entryPrice - cutLossPrice);

  if (riskPerShare === 0) {
    return { shares: 0, positionValue: 0, riskAmount };
  }

  const shares = Math.floor(riskAmount / riskPerShare);
  const positionValue = shares * entryPrice;

  return {
    shares,
    positionValue,
    riskAmount
  };
}

// Determine if a trade setup is favorable
export function evaluateTradeSetup(
  phase: WyckoffPhase,
  strength: number,
  riskRewardRatio: number
): { favorable: boolean; grade: 'A' | 'B' | 'C' | 'D' | 'F'; reason: string } {
  // Only consider long trades for accumulation and markup
  // Only consider short trades for distribution and markdown

  const isLongPhase = phase === 'accumulation' || phase === 'markup';

  // Grade the setup
  let score = 0;
  const reasons: string[] = [];

  // Phase strength (0-40 points)
  if (strength >= 70) {
    score += 40;
    reasons.push('Strong phase confirmation');
  } else if (strength >= 50) {
    score += 30;
    reasons.push('Moderate phase confirmation');
  } else if (strength >= 30) {
    score += 20;
    reasons.push('Weak phase confirmation');
  } else {
    score += 10;
    reasons.push('Phase not well defined');
  }

  // Risk/Reward ratio (0-30 points)
  if (riskRewardRatio >= 3) {
    score += 30;
    reasons.push('Excellent R/R ratio (3:1+)');
  } else if (riskRewardRatio >= 2) {
    score += 20;
    reasons.push('Good R/R ratio (2:1+)');
  } else if (riskRewardRatio >= 1.5) {
    score += 10;
    reasons.push('Acceptable R/R ratio (1.5:1+)');
  } else {
    reasons.push('Poor R/R ratio');
  }

  // Phase preference (0-30 points)
  if (phase === 'accumulation' && strength >= 50) {
    score += 30;
    reasons.push('Accumulation is ideal for entry');
  } else if (phase === 'markup' && strength >= 60) {
    score += 25;
    reasons.push('Markup with momentum');
  } else if (phase === 'distribution') {
    score += 10;
    reasons.push('Distribution - consider taking profits');
  } else if (phase === 'markdown') {
    score += 5;
    reasons.push('Markdown - avoid or short');
  }

  // Determine grade
  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (score >= 80) grade = 'A';
  else if (score >= 65) grade = 'B';
  else if (score >= 50) grade = 'C';
  else if (score >= 35) grade = 'D';
  else grade = 'F';

  return {
    favorable: score >= 50 && isLongPhase,
    grade,
    reason: reasons.join('. ')
  };
}
