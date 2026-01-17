import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb, tickers, pricesDaily, wyckoffAnalysis, metricsDaily, foreignFlow } from '$lib/server/db';
import { eq, desc } from 'drizzle-orm';
import { normalizeSymbol } from '$lib/server/yahoo';
import type { WyckoffPhase } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ params, platform }) => {
  const symbol = normalizeSymbol(params.symbol);

  try {
    const db = getDb(platform);

    // Get ticker
    const tickerResult = await db
      .select()
      .from(tickers)
      .where(eq(tickers.symbol, symbol))
      .limit(1);

    if (tickerResult.length === 0) {
      throw error(404, `Stock ${symbol} not found`);
    }

    const ticker = tickerResult[0];

    // Get latest Wyckoff analysis
    const analysisResult = await db
      .select()
      .from(wyckoffAnalysis)
      .where(eq(wyckoffAnalysis.tickerId, ticker.id))
      .orderBy(desc(wyckoffAnalysis.date))
      .limit(1);

    if (analysisResult.length === 0) {
      throw error(404, `No analysis available for ${symbol}`);
    }

    const analysis = analysisResult[0];

    // Get price history (last 180 days)
    const pricesResult = await db
      .select()
      .from(pricesDaily)
      .where(eq(pricesDaily.tickerId, ticker.id))
      .orderBy(desc(pricesDaily.date))
      .limit(180);

    // Get latest metrics
    const metricsResult = await db
      .select()
      .from(metricsDaily)
      .where(eq(metricsDaily.tickerId, ticker.id))
      .orderBy(desc(metricsDaily.date))
      .limit(1);

    // Get foreign flow data
    const foreignFlowResult = await db
      .select()
      .from(foreignFlow)
      .where(eq(foreignFlow.tickerId, ticker.id))
      .orderBy(desc(foreignFlow.date))
      .limit(60);

    // Calculate current price and change
    const sortedPrices = [...pricesResult].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const latestPrice = sortedPrices[sortedPrices.length - 1];
    const previousPrice = sortedPrices[sortedPrices.length - 2] || latestPrice;

    const price = Number(latestPrice?.close) || 0;
    const prevClose = Number(previousPrice?.close) || price;
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    const metrics = metricsResult[0] || {};

    return {
      stock: {
        symbol: ticker.symbol,
        name: ticker.name || '',
        price,
        change,
        changePercent,
        phase: analysis.phase as WyckoffPhase,
        subPhase: analysis.subPhase,
        strength: Number(analysis.strength) || 0,
        targetPrice: Number(analysis.targetPrice) || 0,
        cutLossPrice: Number(analysis.cutLossPrice) || 0,
        support: Number(analysis.supportLevel) || 0,
        resistance: Number(analysis.resistanceLevel) || 0,
        analysisNotes: analysis.analysisNotes || ''
      },
      prices: sortedPrices.map((p) => ({
        date: p.date,
        open: Number(p.open) || 0,
        high: Number(p.high) || 0,
        low: Number(p.low) || 0,
        close: Number(p.close) || 0,
        volume: p.volume || 0
      })),
      metrics: {
        ma20: Number(metrics.ma20) || null,
        ma50: Number(metrics.ma50) || null,
        ma200: Number(metrics.ma200) || null,
        rsi14: Number(metrics.rsi14) || null,
        mfi14: Number(metrics.mfi14) || null,
        macdLine: Number(metrics.macdLine) || null,
        macdSignal: Number(metrics.macdSignal) || null,
        macdHistogram: Number(metrics.macdHistogram) || null,
        volumeRatio: Number(metrics.volumeRatio) || null
      },
      foreignFlow: foreignFlowResult
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map((f) => ({
          date: f.date,
          foreignBuy: f.foreignBuy || 0,
          foreignSell: f.foreignSell || 0,
          foreignNet: f.foreignNet || 0
        }))
    };
  } catch (err) {
    console.error('Error loading stock:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }
    throw error(500, 'Failed to load stock data');
  }
};
