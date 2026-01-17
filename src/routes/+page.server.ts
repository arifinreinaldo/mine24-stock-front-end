import type { PageServerLoad } from './$types';
import { getDb, searchHistory, wyckoffAnalysis, tickers, pricesDaily } from '$lib/server/db';
import { eq, desc } from 'drizzle-orm';
import type { WyckoffPhase } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ cookies, platform }) => {
  const sessionId = cookies.get('session_id');

  if (!sessionId) {
    return { stocks: [] };
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
      return { stocks: [] };
    }

    // Get Wyckoff analysis and latest prices for each stock
    const stocks = await Promise.all(
      history.map(async (h) => {
        if (!h.tickerId) return null;

        // Get latest Wyckoff analysis
        const analysis = await db
          .select()
          .from(wyckoffAnalysis)
          .where(eq(wyckoffAnalysis.tickerId, h.tickerId))
          .orderBy(desc(wyckoffAnalysis.date))
          .limit(1);

        // Get latest price
        const latestPrice = await db
          .select()
          .from(pricesDaily)
          .where(eq(pricesDaily.tickerId, h.tickerId))
          .orderBy(desc(pricesDaily.date))
          .limit(2);

        if (analysis.length === 0 || latestPrice.length === 0) {
          return null;
        }

        const current = latestPrice[0];
        const previous = latestPrice[1] || latestPrice[0];

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
          phase: analysis[0].phase as WyckoffPhase,
          subPhase: analysis[0].subPhase,
          strength: Number(analysis[0].strength) || 0,
          targetPrice: Number(analysis[0].targetPrice) || 0,
          cutLossPrice: Number(analysis[0].cutLossPrice) || 0
        };
      })
    );

    return {
      stocks: stocks.filter((s): s is NonNullable<typeof s> => s !== null)
    };
  } catch (error) {
    console.error('Error loading stocks:', error);
    return { stocks: [] };
  }
};
