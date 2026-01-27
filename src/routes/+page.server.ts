import type { PageServerLoad } from './$types';
import { getDb, searchHistory, wyckoffAnalysis, tickers, pricesDaily, metricsDaily } from '$lib/server/db';
import { eq, desc, inArray, and } from 'drizzle-orm';
import type { WyckoffPhase } from '$lib/server/db/schema';
import { isIndexSymbol } from '$lib/server/yahoo';

// Global session ID - all users share the same search history
const GLOBAL_SESSION_ID = 'global';

// JCI Index symbol
const JCI_SYMBOL = '^JKSE';

export interface MarketBreadth {
  aboveMA200: number;
  belowMA200: number;
  noData: number;
  total: number;
  percentAbove: number;
}

export const load: PageServerLoad = async ({ platform }) => {
  try {
    const db = getDb(platform);

    // Check if JCI exists in tickers table and auto-add to history if needed
    const jciTicker = await db
      .select()
      .from(tickers)
      .where(eq(tickers.symbol, JCI_SYMBOL))
      .limit(1);

    if (jciTicker.length > 0) {
      // Check if JCI is in search history
      const jciInHistory = await db
        .select()
        .from(searchHistory)
        .where(
          and(
            eq(searchHistory.tickerId, jciTicker[0].id),
            eq(searchHistory.sessionId, GLOBAL_SESSION_ID)
          )
        )
        .limit(1);

      // Auto-add JCI to history if not present
      if (jciInHistory.length === 0) {
        await db.insert(searchHistory).values({
          tickerId: jciTicker[0].id,
          sessionId: GLOBAL_SESSION_ID
        });
        console.log('[page.server] Auto-added JCI to search history');
      }
    }

    // Get all stocks from global search history with their Wyckoff analysis
    const history = await db
      .select({
        tickerId: searchHistory.tickerId,
        symbol: tickers.symbol,
        name: tickers.name
      })
      .from(searchHistory)
      .innerJoin(tickers, eq(searchHistory.tickerId, tickers.id))
      .where(eq(searchHistory.sessionId, GLOBAL_SESSION_ID))
      .orderBy(desc(searchHistory.searchedAt));

    console.log('[page.server] history count:', history.length);

    if (history.length === 0) {
      return { stocks: [], jci: null, marketBreadth: null };
    }

    const tickerIds = history.map(h => h.tickerId).filter((id): id is string => id !== null);

    if (tickerIds.length === 0) {
      return { stocks: [], jci: null, marketBreadth: null };
    }

    // Batch fetch all analyses, prices, and metrics in single queries
    const [allAnalyses, allPrices, allMetrics] = await Promise.all([
      // Get latest analysis for each ticker
      db
        .select()
        .from(wyckoffAnalysis)
        .where(inArray(wyckoffAnalysis.tickerId, tickerIds))
        .orderBy(desc(wyckoffAnalysis.date)),

      // Get latest 2 prices for each ticker
      db
        .select()
        .from(pricesDaily)
        .where(inArray(pricesDaily.tickerId, tickerIds))
        .orderBy(desc(pricesDaily.date)),

      // Get latest metrics for market breadth
      db
        .select()
        .from(metricsDaily)
        .where(inArray(metricsDaily.tickerId, tickerIds))
        .orderBy(desc(metricsDaily.date))
    ]);

    // Group by tickerId
    const analysisMap = new Map<string, typeof allAnalyses[0]>();
    for (const a of allAnalyses) {
      if (a.tickerId && !analysisMap.has(a.tickerId)) {
        analysisMap.set(a.tickerId, a);
      }
    }

    const pricesMap = new Map<string, typeof allPrices>();
    for (const p of allPrices) {
      if (!p.tickerId) continue;
      const existing = pricesMap.get(p.tickerId) || [];
      if (existing.length < 2) {
        existing.push(p);
        pricesMap.set(p.tickerId, existing);
      }
    }

    const metricsMap = new Map<string, typeof allMetrics[0]>();
    for (const m of allMetrics) {
      if (m.tickerId && !metricsMap.has(m.tickerId)) {
        metricsMap.set(m.tickerId, m);
      }
    }

    // Calculate market breadth (exclude JCI)
    let aboveMA200 = 0;
    let belowMA200 = 0;
    let noData = 0;

    // Build stocks array and separate JCI
    let jciData: {
      symbol: string;
      name: string;
      price: number;
      change: number;
      changePercent: number;
      phase: WyckoffPhase;
      subPhase: string | null;
      strength: number;
    } | null = null;

    const regularStocks: Array<{
      symbol: string;
      name: string;
      price: number;
      change: number;
      changePercent: number;
      phase: WyckoffPhase;
      subPhase: string | null;
      strength: number;
      targetPrice: number;
      cutLossPrice: number;
    }> = [];

    for (const h of history) {
      if (!h.tickerId || !h.symbol) continue;

      const analysis = analysisMap.get(h.tickerId);
      const prices = pricesMap.get(h.tickerId) || [];

      console.log('[page.server] Processing:', h.symbol, 'analysis:', !!analysis, 'prices:', prices.length);

      if (!analysis || prices.length === 0) {
        continue;
      }

      const current = prices[0];
      const previous = prices[1] || prices[0];

      const price = Number(current.close) || 0;
      const prevClose = Number(previous.close) || price;
      const change = price - prevClose;
      const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

      // Check if this is JCI
      if (isIndexSymbol(h.symbol)) {
        jciData = {
          symbol: h.symbol,
          name: h.name || 'Jakarta Composite Index',
          price,
          change,
          changePercent,
          phase: analysis.phase as WyckoffPhase,
          subPhase: analysis.subPhase,
          strength: Number(analysis.strength) || 0
        };
      } else {
        regularStocks.push({
          symbol: h.symbol,
          name: h.name || '',
          price,
          change,
          changePercent,
          phase: analysis.phase as WyckoffPhase,
          subPhase: analysis.subPhase,
          strength: Number(analysis.strength) || 0,
          targetPrice: Number(analysis.targetPrice) || 0,
          cutLossPrice: Number(analysis.cutLossPrice) || 0
        });

        // Calculate market breadth (only for regular stocks)
        const metrics = metricsMap.get(h.tickerId);
        if (metrics && metrics.ma200) {
          const ma200 = Number(metrics.ma200);
          if (price > ma200) {
            aboveMA200++;
          } else {
            belowMA200++;
          }
        } else {
          noData++;
        }
      }
    }

    // Calculate market breadth stats
    const total = aboveMA200 + belowMA200;
    const marketBreadth: MarketBreadth | null = total > 0
      ? {
          aboveMA200,
          belowMA200,
          noData,
          total: aboveMA200 + belowMA200 + noData,
          percentAbove: Math.round((aboveMA200 / total) * 100)
        }
      : null;

    return {
      stocks: regularStocks,
      jci: jciData,
      marketBreadth
    };
  } catch (error) {
    console.error('Error loading stocks:', error);
    return { stocks: [], jci: null, marketBreadth: null };
  }
};
