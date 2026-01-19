import { json, error, type RequestEvent } from '@sveltejs/kit';
import { getDb, searchHistory, pricesDaily, wyckoffAnalysis, metricsDaily, foreignFlow } from '$lib/server/db';
import { eq, inArray } from 'drizzle-orm';

// DELETE - Clear all historical data for user's stocks
export const DELETE = async ({ cookies, platform, url }: RequestEvent) => {
  const sessionId = cookies.get('session_id');

  if (!sessionId) {
    throw error(401, 'No session found');
  }

  // Check if we should clear only watchlist or all data
  const clearAll = url.searchParams.get('all') === 'true';

  try {
    const db = getDb(platform);

    // Get all stocks from user's search history
    const history = await db
      .select({
        tickerId: searchHistory.tickerId
      })
      .from(searchHistory)
      .where(eq(searchHistory.sessionId, sessionId));

    if (history.length === 0) {
      return json({ success: true, message: 'No stocks to clear', cleared: 0 });
    }

    const tickerIds = history
      .map(h => h.tickerId)
      .filter((id): id is string => id !== null);

    if (tickerIds.length === 0) {
      return json({ success: true, message: 'No stocks to clear', cleared: 0 });
    }

    let deletedPrices = 0;
    let deletedAnalysis = 0;
    let deletedMetrics = 0;
    let deletedForeignFlow = 0;
    let deletedWatchlist = 0;

    // Delete all related data for user's stocks
    // Order matters due to foreign key constraints

    // 1. Delete prices
    const pricesResult = await db
      .delete(pricesDaily)
      .where(inArray(pricesDaily.tickerId, tickerIds));
    deletedPrices = tickerIds.length;

    // 2. Delete Wyckoff analysis
    const analysisResult = await db
      .delete(wyckoffAnalysis)
      .where(inArray(wyckoffAnalysis.tickerId, tickerIds));
    deletedAnalysis = tickerIds.length;

    // 3. Delete metrics
    const metricsResult = await db
      .delete(metricsDaily)
      .where(inArray(metricsDaily.tickerId, tickerIds));
    deletedMetrics = tickerIds.length;

    // 4. Delete foreign flow
    const foreignFlowResult = await db
      .delete(foreignFlow)
      .where(inArray(foreignFlow.tickerId, tickerIds));
    deletedForeignFlow = tickerIds.length;

    // 5. If clearAll, also delete from watchlist (search history)
    if (clearAll) {
      await db
        .delete(searchHistory)
        .where(eq(searchHistory.sessionId, sessionId));
      deletedWatchlist = tickerIds.length;
    }

    console.log(`[clear] Cleared data for ${tickerIds.length} stocks (clearAll: ${clearAll})`);

    return json({
      success: true,
      message: clearAll
        ? `Cleared all data and watchlist for ${tickerIds.length} stocks`
        : `Cleared historical data for ${tickerIds.length} stocks`,
      cleared: tickerIds.length,
      details: {
        prices: deletedPrices,
        analysis: deletedAnalysis,
        metrics: deletedMetrics,
        foreignFlow: deletedForeignFlow,
        watchlist: deletedWatchlist
      }
    });
  } catch (err) {
    console.error('Clear error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw error(500, `Failed to clear data: ${message}`);
  }
};
