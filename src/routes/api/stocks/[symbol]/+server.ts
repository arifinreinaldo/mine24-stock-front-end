import { json, error, type RequestEvent } from '@sveltejs/kit';
import { getDb, searchHistory, tickers } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';

// Global session ID - all users share the same search history
const GLOBAL_SESSION_ID = 'global';

// DELETE - Remove a single stock from the watchlist
export const DELETE = async ({ params, platform }: RequestEvent) => {
  const { symbol } = params;

  if (!symbol) {
    throw error(400, 'Symbol is required');
  }

  try {
    const db = getDb(platform);

    // Find the ticker by symbol
    const ticker = await db
      .select({ id: tickers.id })
      .from(tickers)
      .where(eq(tickers.symbol, symbol))
      .limit(1);

    if (ticker.length === 0) {
      throw error(404, `Stock ${symbol} not found`);
    }

    const tickerId = ticker[0].id;

    // Delete from search history
    await db
      .delete(searchHistory)
      .where(
        and(
          eq(searchHistory.tickerId, tickerId),
          eq(searchHistory.sessionId, GLOBAL_SESSION_ID)
        )
      );

    console.log(`[delete] Removed ${symbol} from watchlist`);

    return json({
      success: true,
      message: `Removed ${symbol} from watchlist`,
      symbol
    });
  } catch (err) {
    console.error('Delete stock error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw error(500, `Failed to delete stock: ${message}`);
  }
};
