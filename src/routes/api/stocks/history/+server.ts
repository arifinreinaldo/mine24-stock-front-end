import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, searchHistory, wyckoffAnalysis, tickers, pricesDaily } from '$lib/server/db';
import { eq, desc, inArray } from 'drizzle-orm';
import type { WyckoffPhase } from '$lib/server/db/schema';

export const POST: RequestHandler = async ({ request, cookies, platform }) => {
  const body = await request.json() as { sessionId?: string };
  const { sessionId: clientSessionId } = body;

  // Use client session ID or cookie session ID
  const sessionId = clientSessionId || cookies.get('session_id');

  if (!sessionId) {
    return json({ stocks: [] });
  }

  // Sync cookie with the session ID being used
  if (clientSessionId && clientSessionId !== cookies.get('session_id')) {
    cookies.set('session_id', clientSessionId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      maxAge: 60 * 60 * 24 * 365 // 1 year
    });
  }

  try {
    const db = getDb(platform);

    // Get all stocks from user's search history with their Wyckoff analysis
    const history = await db
      .select({
        tickerId: searchHistory.tickerId,
        symbol: tickers.symbol,
        name: tickers.name
      })
      .from(searchHistory)
      .innerJoin(tickers, eq(searchHistory.tickerId, tickers.id))
      .where(eq(searchHistory.sessionId, sessionId))
      .orderBy(desc(searchHistory.searchedAt));

    if (history.length === 0) {
      return json({ stocks: [] });
    }

    const tickerIds = history.map(h => h.tickerId).filter((id): id is string => id !== null);

    if (tickerIds.length === 0) {
      return json({ stocks: [] });
    }

    // Batch fetch all analyses and prices in single queries
    const [allAnalyses, allPrices] = await Promise.all([
      db
        .select()
        .from(wyckoffAnalysis)
        .where(inArray(wyckoffAnalysis.tickerId, tickerIds))
        .orderBy(desc(wyckoffAnalysis.date)),

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

    return json({
      stocks: stocks.filter((s): s is NonNullable<typeof s> => s !== null)
    });
  } catch (err) {
    console.error('Error loading stocks history:', err);
    throw error(500, 'Failed to load stocks history');
  }
};
