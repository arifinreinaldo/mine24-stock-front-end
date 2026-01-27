import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, tickers, searchHistory, pricesDaily, wyckoffAnalysis, metricsDaily, foreignFlow } from '$lib/server/db';
import { eq, sql } from 'drizzle-orm';
import { fetchLatestQuote, fetchHistoricalDaily, normalizeSymbol, getHistoryDaysNeeded, isIndexSymbol } from '$lib/server/yahoo';
import { detectWyckoffPhase } from '$lib/server/analysis/wyckoff';
import { calculateTargetAndCutLoss } from '$lib/server/analysis/targets';
import { generateSimulatedForeignFlow } from '$lib/server/analysis/foreignFlow';

// Global session ID - all users share the same search history
const GLOBAL_SESSION_ID = 'global';

export const POST: RequestHandler = async ({ request, platform }) => {
  const body = await request.json() as { symbol?: string };
  const { symbol } = body;

  if (!symbol || typeof symbol !== 'string') {
    throw error(400, 'Symbol is required');
  }

  const normalizedSymbol = normalizeSymbol(symbol);
  console.log('[search] Input symbol:', symbol, '-> Normalized:', normalizedSymbol);

  try {
    const db = getDb(platform);

    // Check if ticker exists
    let ticker = await db
      .select()
      .from(tickers)
      .where(eq(tickers.symbol, normalizedSymbol))
      .limit(1);

    // If ticker doesn't exist, fetch from Yahoo Finance and create it
    if (ticker.length === 0) {
      console.log('[search] Ticker not in DB, fetching from Yahoo...');
      const quote = await fetchLatestQuote(normalizedSymbol);
      console.log('[search] Yahoo quote result:', quote ? 'Found' : 'Not found');

      if (!quote) {
        throw error(404, `Stock ${normalizedSymbol} not found`);
      }

      const [newTicker] = await db
        .insert(tickers)
        .values({
          symbol: normalizedSymbol,
          name: quote.name,
          exchange: quote.exchange || 'IDX'
        })
        .returning();

      ticker = [newTicker];
    }

    const tickerId = ticker[0].id;
    console.log('[search] tickerId:', tickerId);

    // Add to search history (upsert) - using global session for shared history
    await db
      .insert(searchHistory)
      .values({
        tickerId,
        sessionId: GLOBAL_SESSION_ID
      })
      .onConflictDoUpdate({
        target: [searchHistory.tickerId, searchHistory.sessionId],
        set: {
          searchedAt: new Date()
        }
      });
    console.log('[search] Search history saved');

    // Fetch historical data
    const daysNeeded = getHistoryDaysNeeded();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysNeeded);

    const historicalPrices = await fetchHistoricalDaily(normalizedSymbol, fromDate);

    if (historicalPrices.length === 0) {
      throw error(500, 'Could not fetch historical data');
    }

    // Save prices to database (batch insert to avoid subrequest limit)
    const priceValues = historicalPrices.map(price => ({
      tickerId,
      date: price.date.toISOString().split('T')[0],
      open: price.open.toString(),
      high: price.high.toString(),
      low: price.low.toString(),
      close: price.close.toString(),
      volume: price.volume
    }));

    // Batch upsert all prices in a single query to avoid subrequest limit
    if (priceValues.length > 0) {
      await db
        .insert(pricesDaily)
        .values(priceValues)
        .onConflictDoUpdate({
          target: [pricesDaily.tickerId, pricesDaily.date],
          set: {
            open: sql`excluded.open`,
            high: sql`excluded.high`,
            low: sql`excluded.low`,
            close: sql`excluded.close`,
            volume: sql`excluded.volume`
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

    const today = new Date().toISOString().split('T')[0];
    console.log('[search] Wyckoff result - Phase:', wyckoffResult.phase, 'SubPhase:', wyckoffResult.subPhase, 'Strength:', wyckoffResult.strength);
    console.log('[search] Reasoning:', wyckoffResult.reasoning);

    // Save Wyckoff analysis
    await db
      .insert(wyckoffAnalysis)
      .values({
        tickerId,
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
        tickerId,
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

    // Generate and save simulated foreign flow (skip for index symbols)
    if (!isIndexSymbol(normalizedSymbol)) {
      const simulatedFlows = generateSimulatedForeignFlow(historicalPrices);
      const recentFlows = simulatedFlows.slice(-60);

      if (recentFlows.length > 0) {
        const flowValues = recentFlows.map(flow => ({
          tickerId,
          date: flow.date.toISOString().split('T')[0],
          foreignBuy: flow.foreignBuy,
          foreignSell: flow.foreignSell,
          foreignNet: flow.foreignNet,
          foreignBuyValue: flow.foreignBuyValue.toString(),
          foreignSellValue: flow.foreignSellValue.toString(),
          foreignNetValue: flow.foreignNetValue.toString()
        }));

        await db
          .insert(foreignFlow)
          .values(flowValues)
          .onConflictDoUpdate({
            target: [foreignFlow.tickerId, foreignFlow.date],
            set: {
              foreignBuy: sql`excluded.foreign_buy`,
              foreignSell: sql`excluded.foreign_sell`,
              foreignNet: sql`excluded.foreign_net`,
              foreignBuyValue: sql`excluded.foreign_buy_value`,
              foreignSellValue: sql`excluded.foreign_sell_value`,
              foreignNetValue: sql`excluded.foreign_net_value`
            }
          });
      }
    }

    return json({
      success: true,
      symbol: normalizedSymbol,
      phase: wyckoffResult.phase,
      strength: wyckoffResult.strength
    });
  } catch (err) {
    console.error('Search error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }
    // Include error details for debugging
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw error(500, `Failed to process stock search: ${message}`);
  }
};
