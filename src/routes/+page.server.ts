import type { PageServerLoad } from './$types';
import { getDb, searchHistory, wyckoffAnalysis, tickers, pricesDaily, metricsDaily, foreignFlow } from '$lib/server/db';
import { eq, desc, inArray, and, sql } from 'drizzle-orm';
import type { WyckoffPhase } from '$lib/server/db/schema';
import { isIndexSymbol } from '$lib/server/yahoo';
import { generateRecommendation, type StockRecommendation } from '$lib/server/analysis/recommendation';

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

export type { StockRecommendation };

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

    // Batch fetch all analyses, prices, metrics, and foreign flow in single queries
    const [allAnalyses, allPrices, allMetrics, allForeignFlow] = await Promise.all([
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
        .orderBy(desc(metricsDaily.date)),

      // Get recent foreign flow (last 5 days) for each ticker
      db
        .select()
        .from(foreignFlow)
        .where(inArray(foreignFlow.tickerId, tickerIds))
        .orderBy(desc(foreignFlow.date))
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

    // Group foreign flow by tickerId (sum last 5 days for net flow)
    const foreignFlowMap = new Map<string, number>();
    const flowCountMap = new Map<string, number>();
    for (const f of allForeignFlow) {
      if (!f.tickerId) continue;
      const count = flowCountMap.get(f.tickerId) || 0;
      if (count < 5) { // Only sum last 5 days
        const currentNet = foreignFlowMap.get(f.tickerId) || 0;
        foreignFlowMap.set(f.tickerId, currentNet + (f.foreignNet || 0));
        flowCountMap.set(f.tickerId, count + 1);
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
      recommendation: StockRecommendation | null;
    }> = [];

    // We'll calculate market breadth first (in a preliminary pass) to use in recommendations
    let prelimAboveMA200 = 0;
    let prelimBelowMA200 = 0;
    for (const h of history) {
      if (!h.tickerId || !h.symbol || isIndexSymbol(h.symbol)) continue;
      const metrics = metricsMap.get(h.tickerId);
      const prices = pricesMap.get(h.tickerId) || [];
      if (metrics && metrics.ma200 && prices.length > 0) {
        const price = Number(prices[0].close) || 0;
        const ma200 = Number(metrics.ma200);
        if (price > ma200) prelimAboveMA200++;
        else prelimBelowMA200++;
      }
    }
    const prelimTotal = prelimAboveMA200 + prelimBelowMA200;
    const prelimMarketBreadthPercent = prelimTotal > 0 ? Math.round((prelimAboveMA200 / prelimTotal) * 100) : null;

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
        // Get metrics and foreign flow for recommendation
        const metrics = metricsMap.get(h.tickerId);
        const foreignNetFlow = foreignFlowMap.get(h.tickerId) || null;

        // Generate recommendation
        let recommendation: StockRecommendation | null = null;
        try {
          recommendation = generateRecommendation({
            currentPrice: price,
            phase: analysis.phase as WyckoffPhase,
            subPhase: analysis.subPhase,
            strength: Number(analysis.strength) || 0,
            targetPrice: Number(analysis.targetPrice) || price * 1.1,
            cutLossPrice: Number(analysis.cutLossPrice) || price * 0.95,
            support: Number(analysis.supportLevel) || price * 0.95,
            resistance: Number(analysis.resistanceLevel) || price * 1.1,
            ma200: metrics?.ma200 ? Number(metrics.ma200) : null,
            rsi14: metrics?.rsi14 ? Number(metrics.rsi14) : null,
            foreignNetFlow,
            marketBreadthPercent: prelimMarketBreadthPercent
          });
        } catch (e) {
          console.error('[page.server] Error generating recommendation for', h.symbol, e);
        }

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
          cutLossPrice: Number(analysis.cutLossPrice) || 0,
          recommendation
        });

        // Calculate market breadth (only for regular stocks)
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
