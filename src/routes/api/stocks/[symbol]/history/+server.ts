import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, tickers, pricesDaily } from '$lib/server/db';
import { eq, desc } from 'drizzle-orm';
import { normalizeSymbol } from '$lib/server/yahoo';

export const GET: RequestHandler = async ({ params, url, platform }) => {
  const symbol = normalizeSymbol(params.symbol);
  const limit = parseInt(url.searchParams.get('limit') || '180');

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

    // Get price history
    const prices = await db
      .select()
      .from(pricesDaily)
      .where(eq(pricesDaily.tickerId, ticker.id))
      .orderBy(desc(pricesDaily.date))
      .limit(limit);

    // Sort ascending by date
    const sortedPrices = [...prices].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return json(
      sortedPrices.map((p) => ({
        date: p.date,
        open: Number(p.open) || 0,
        high: Number(p.high) || 0,
        low: Number(p.low) || 0,
        close: Number(p.close) || 0,
        volume: p.volume || 0
      }))
    );
  } catch (err) {
    console.error('Error fetching history:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }
    throw error(500, 'Failed to fetch price history');
  }
};
