import type { PageServerLoad } from './$types';
import { getDb, searchHistory, wyckoffAnalysis, tickers, pricesDaily } from '$lib/server/db';
import { eq, desc, inArray } from 'drizzle-orm';
import type { WyckoffPhase } from '$lib/server/db/schema';

// Global session ID - all users share the same search history
const GLOBAL_SESSION_ID = 'global';

export const load: PageServerLoad = async ({ platform }) => {
  try {
    const db = getDb(platform);

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
      return { stocks: [] };
    }

    const tickerIds = history.map(h => h.tickerId).filter((id): id is string => id !== null);

    if (tickerIds.length === 0) {
      return { stocks: [] };
    }

    // Batch fetch all analyses and prices in single queries
    const [allAnalyses, allPrices] = await Promise.all([
      // Get latest analysis for each ticker using distinct on
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
        .orderBy(desc(pricesDaily.date))
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

    // Build stocks array
    const stocks = history.map(h => {
      if (!h.tickerId) return null;

      const analysis = analysisMap.get(h.tickerId);
      const prices = pricesMap.get(h.tickerId) || [];

      console.log('[page.server] Processing:', h.symbol, 'analysis:', !!analysis, 'prices:', prices.length);

      if (!analysis || prices.length === 0) {
        return null;
      }

      const current = prices[0];
      const previous = prices[1] || prices[0];

      const price = Number(current.close) || 0;
      const prevClose = Number(previous.close) || price;
      const change = price - prevClose;
      const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

      return {
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
      };
    });

    return {
      stocks: stocks.filter((s): s is NonNullable<typeof s> => s !== null)
    };
  } catch (error) {
    console.error('Error loading stocks:', error);
    return { stocks: [] };
  }
};
