import { json, error, type RequestEvent } from '@sveltejs/kit';
import { getDb, tickers, searchHistory, pricesDaily, wyckoffAnalysis, metricsDaily } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { fetchHistoricalDaily, normalizeSymbol, getHistoryDaysNeeded, clearCache } from '$lib/server/yahoo';
import { detectWyckoffPhase } from '$lib/server/analysis/wyckoff';
import { calculateTargetAndCutLoss } from '$lib/server/analysis/targets';

export const POST = async ({ cookies, platform }: RequestEvent) => {
  const sessionId = cookies.get('session_id');

  if (!sessionId) {
    throw error(401, 'No session found');
  }

  try {
    const db = getDb(platform);

    // Get all stocks from user's search history
    const history = await db
      .select({
        tickerId: searchHistory.tickerId,
        symbol: tickers.symbol
      })
      .from(searchHistory)
      .innerJoin(tickers, eq(searchHistory.tickerId, tickers.id))
      .where(eq(searchHistory.sessionId, sessionId));

    if (history.length === 0) {
      return json({ success: true, message: 'No stocks to refresh', refreshed: 0 });
    }

    const today = new Date().toISOString().split('T')[0];
    const daysNeeded = getHistoryDaysNeeded();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysNeeded);

    let refreshedCount = 0;

    // Clear all in-memory cache to ensure fresh data
    clearCache();
    console.log('[refresh] Cleared in-memory cache');

    // Process each stock
    for (const item of history) {
      if (!item.tickerId || !item.symbol) continue;

      try {
        const normalizedSymbol = normalizeSymbol(item.symbol);
        console.log(`[refresh] Refreshing ${normalizedSymbol}...`);

        // Fetch fresh historical data from Yahoo Finance
        const historicalPrices = await fetchHistoricalDaily(normalizedSymbol, fromDate);

        if (historicalPrices.length === 0) {
          console.log(`[refresh] No data for ${normalizedSymbol}`);
          continue;
        }

        // Update prices - use onConflictDoUpdate to overwrite existing prices
        const priceValues = historicalPrices.map(price => ({
          tickerId: item.tickerId,
          date: price.date.toISOString().split('T')[0],
          open: price.open.toString(),
          high: price.high.toString(),
          low: price.low.toString(),
          close: price.close.toString(),
          volume: price.volume
        }));

        // Insert or update prices
        for (const priceValue of priceValues) {
          await db
            .insert(pricesDaily)
            .values(priceValue)
            .onConflictDoUpdate({
              target: [pricesDaily.tickerId, pricesDaily.date],
              set: {
                open: priceValue.open,
                high: priceValue.high,
                low: priceValue.low,
                close: priceValue.close,
                volume: priceValue.volume
              }
            });
        }

        // Run Wyckoff analysis
        const wyckoffResult = detectWyckoffPhase(historicalPrices);

        // Calculate target and cut loss
        const currentPrice = historicalPrices[historicalPrices.length - 1].close;
        const targets = calculateTargetAndCutLoss(
          currentPrice,
          wyckoffResult.phase,
          wyckoffResult.support,
          wyckoffResult.resistance,
          wyckoffResult.indicators.ma20,
          wyckoffResult.indicators.ma50
        );

        // Save Wyckoff analysis
        await db
          .insert(wyckoffAnalysis)
          .values({
            tickerId: item.tickerId,
            date: today,
            phase: wyckoffResult.phase,
            subPhase: wyckoffResult.subPhase,
            strength: wyckoffResult.strength.toString(),
            targetPrice: targets.targetPrice.toString(),
            cutLossPrice: targets.cutLossPrice.toString(),
            supportLevel: wyckoffResult.support.toString(),
            resistanceLevel: wyckoffResult.resistance.toString(),
            analysisNotes: wyckoffResult.reasoning
          })
          .onConflictDoUpdate({
            target: [wyckoffAnalysis.tickerId, wyckoffAnalysis.date],
            set: {
              phase: wyckoffResult.phase,
              subPhase: wyckoffResult.subPhase,
              strength: wyckoffResult.strength.toString(),
              targetPrice: targets.targetPrice.toString(),
              cutLossPrice: targets.cutLossPrice.toString(),
              supportLevel: wyckoffResult.support.toString(),
              resistanceLevel: wyckoffResult.resistance.toString(),
              analysisNotes: wyckoffResult.reasoning
            }
          });

        // Save metrics
        const indicators = wyckoffResult.indicators;
        await db
          .insert(metricsDaily)
          .values({
            tickerId: item.tickerId,
            date: today,
            ma20: indicators.ma20?.toString() || null,
            ma50: indicators.ma50?.toString() || null,
            ma200: indicators.ma200?.toString() || null,
            rsi14: indicators.rsi14?.toString() || null,
            mfi14: indicators.mfi14?.toString() || null,
            macdLine: indicators.macdLine?.toString() || null,
            macdSignal: indicators.macdSignal?.toString() || null,
            macdHistogram: indicators.macdHistogram?.toString() || null,
            volumeAvg20: indicators.volumeAvg20 || null,
            volumeRatio: indicators.volumeRatio?.toString() || null
          })
          .onConflictDoUpdate({
            target: [metricsDaily.tickerId, metricsDaily.date],
            set: {
              ma20: indicators.ma20?.toString() || null,
              ma50: indicators.ma50?.toString() || null,
              ma200: indicators.ma200?.toString() || null,
              rsi14: indicators.rsi14?.toString() || null,
              mfi14: indicators.mfi14?.toString() || null,
              macdLine: indicators.macdLine?.toString() || null,
              macdSignal: indicators.macdSignal?.toString() || null,
              macdHistogram: indicators.macdHistogram?.toString() || null,
              volumeAvg20: indicators.volumeAvg20 || null,
              volumeRatio: indicators.volumeRatio?.toString() || null
            }
          });

        refreshedCount++;
        console.log(`[refresh] ${normalizedSymbol} refreshed successfully`);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        console.error(`[refresh] Error refreshing ${item.symbol}:`, err);
      }
    }

    return json({
      success: true,
      message: `Refreshed ${refreshedCount} stocks`,
      refreshed: refreshedCount
    });
  } catch (err) {
    console.error('Refresh error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw error(500, `Failed to refresh stocks: ${message}`);
  }
};
