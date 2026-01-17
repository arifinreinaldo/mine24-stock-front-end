import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchStocks } from '$lib/server/yahoo';

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get('q');

  if (!query || query.length < 2) {
    return json([]);
  }

  try {
    const results = await searchStocks(query);
    return json(results);
  } catch (err) {
    console.error('Search error:', err);
    return json([]);
  }
};
