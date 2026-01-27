import type { HistoricalPrice } from '../yahoo';

export interface SimulatedForeignFlow {
  date: Date;
  foreignBuy: number;
  foreignSell: number;
  foreignNet: number;
  foreignBuyValue: number;
  foreignSellValue: number;
  foreignNetValue: number;
}

/**
 * Generate simulated foreign flow data from historical prices
 *
 * Simulation logic:
 * - Foreign participation: 40-50% of daily volume (typical for IDX blue chips)
 * - Net flow correlates with price direction (positive on up days)
 * - Buy/sell ratio based on price change magnitude
 * - Randomness factor (+/- 5%) for realism
 */
export function generateSimulatedForeignFlow(prices: HistoricalPrice[]): SimulatedForeignFlow[] {
  if (prices.length < 2) {
    return [];
  }

  // Sort by date ascending
  const sortedPrices = [...prices].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const flows: SimulatedForeignFlow[] = [];

  for (let i = 1; i < sortedPrices.length; i++) {
    const current = sortedPrices[i];
    const previous = sortedPrices[i - 1];

    // Calculate price change
    const priceChange = current.close - previous.close;
    const priceChangePercent = (priceChange / previous.close) * 100;

    // Foreign participation: 40-50% of volume
    const foreignParticipation = 0.40 + Math.random() * 0.10;
    const foreignVolume = Math.round(current.volume * foreignParticipation);

    // Determine buy/sell ratio based on price direction
    // On up days: foreign tends to be net buyers (55-70% buy)
    // On down days: foreign tends to be net sellers (30-45% buy)
    let buyRatio: number;

    if (priceChangePercent > 0) {
      // Up day: 55-70% foreign buy
      const magnitude = Math.min(Math.abs(priceChangePercent) / 5, 1); // Cap at 5% move
      buyRatio = 0.55 + magnitude * 0.15;
    } else if (priceChangePercent < 0) {
      // Down day: 30-45% foreign buy
      const magnitude = Math.min(Math.abs(priceChangePercent) / 5, 1);
      buyRatio = 0.45 - magnitude * 0.15;
    } else {
      // Flat day: roughly equal
      buyRatio = 0.48 + Math.random() * 0.04;
    }

    // Add randomness factor (+/- 5%)
    buyRatio = Math.max(0.25, Math.min(0.75, buyRatio + (Math.random() - 0.5) * 0.10));

    const foreignBuy = Math.round(foreignVolume * buyRatio);
    const foreignSell = foreignVolume - foreignBuy;
    const foreignNet = foreignBuy - foreignSell;

    // Calculate values (volume * average price)
    const avgPrice = (current.high + current.low + current.close) / 3;
    const foreignBuyValue = Math.round(foreignBuy * avgPrice);
    const foreignSellValue = Math.round(foreignSell * avgPrice);
    const foreignNetValue = foreignBuyValue - foreignSellValue;

    flows.push({
      date: current.date,
      foreignBuy,
      foreignSell,
      foreignNet,
      foreignBuyValue,
      foreignSellValue,
      foreignNetValue
    });
  }

  return flows;
}

/**
 * Get the last N days of foreign flow data
 */
export function getRecentForeignFlow(
  flows: SimulatedForeignFlow[],
  days: number = 60
): SimulatedForeignFlow[] {
  // Sort by date descending and take the most recent N days
  return [...flows]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, days);
}
