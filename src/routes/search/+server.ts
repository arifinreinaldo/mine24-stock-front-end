import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, tickers, searchHistory, pricesDaily, wyckoffAnalysis, metricsDaily } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { fetchLatestQuote, fetchHistoricalDaily, normalizeSymbol, getHistoryDaysNeeded } from '$lib/server/yahoo';
import { detectWyckoffPhase } from '$lib/server/analysis/wyckoff';
import { calculateTargetAndCutLoss } from '$lib/server/analysis/targets';

export const POST: RequestHandler = async ({ request, cookies, platform }) => {
  const body = await request.json();
  const { symbol, sessionId: clientSessionId } = body;

  if (!symbol || typeof symbol !== 'string') {
    throw error(400, 'Symbol is required');
  }

  // Use client session ID or cookie session ID
  let sessionId = clientSessionId || cookies.get('session_id');

  if (!sessionId) {
    // Generate new session ID
    sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 15)}`;
  }

  // Always sync cookie with the session ID being used
  cookies.set('session_id', sessionId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    maxAge: 60 * 60 * 24 * 365 // 1 year
  });

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
    console.log('[search] tickerId:', tickerId, 'sessionId:', sessionId);

    // Add to search history (upsert)
    await db
      .insert(searchHistory)
      .values({
        tickerId,
        sessionId
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

    await db
      .insert(pricesDaily)
      .values(priceValues)
      .onConflictDoNothing();

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
