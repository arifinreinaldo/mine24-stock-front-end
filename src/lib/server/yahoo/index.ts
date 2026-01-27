// Yahoo Finance client using native fetch (Cloudflare Workers compatible)

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  marketCap?: number;
  exchange: string;
}

export interface HistoricalPrice {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose?: number;
}

// In-memory cache for rate limiting
const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && cached.expiry > Date.now()) {
    return cached.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown, ttl: number = CACHE_TTL): void {
  cache.set(key, { data, expiry: Date.now() + ttl });
}

// Clear cache for a specific symbol or all cache
export function clearCache(symbol?: string): void {
  if (symbol) {
    const normalizedSymbol = normalizeSymbol(symbol);
    // Clear all cache entries related to this symbol
    for (const key of cache.keys()) {
      if (key.includes(normalizedSymbol)) {
        cache.delete(key);
      }
    }
  } else {
    // Clear all cache
    cache.clear();
  }
}

// Check if symbol is an index (starts with ^)
export function isIndexSymbol(symbol: string): boolean {
  return symbol.trim().startsWith('^');
}

// Normalize Indonesian ticker symbol
export function normalizeSymbol(symbol: string): string {
  const cleaned = symbol.toUpperCase().trim();
  // Index symbols (like ^JKSE) don't get .JK suffix
  if (isIndexSymbol(cleaned)) {
    return cleaned;
  }
  // If already has .JK suffix, return as is
  if (cleaned.endsWith('.JK')) {
    return cleaned;
  }
  // Add .JK suffix for Indonesian stocks
  return `${cleaned}.JK`;
}

// Common fetch headers
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9'
};

// Yahoo Finance API response types
interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        shortName?: string;
        longName?: string;
        regularMarketPrice?: number;
        previousClose?: number;
        regularMarketOpen?: number;
        regularMarketDayHigh?: number;
        regularMarketDayLow?: number;
        regularMarketVolume?: number;
        marketCap?: number;
        exchange?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
        adjclose?: Array<{
          adjclose?: (number | null)[];
        }>;
      };
    }>;
    error?: {
      code?: string;
      description?: string;
    };
  };
}

interface YahooSearchResponse {
  quotes?: Array<{
    symbol?: string;
    shortname?: string;
    longname?: string;
    exchange?: string;
    quoteType?: string;
  }>;
}

// Fetch latest quote for a stock
export async function fetchLatestQuote(symbol: string): Promise<StockQuote | null> {
  const normalizedSymbol = normalizeSymbol(symbol);
  const cacheKey = `quote:${normalizedSymbol}`;

  // Check cache
  const cached = getCached<StockQuote>(cacheKey);
  if (cached) {
    console.log(`[yahoo] Cache hit for ${normalizedSymbol}`);
    return cached;
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalizedSymbol)}?interval=1d&range=1d`;
    console.log(`[yahoo] Fetching quote from: ${url}`);

    const response = await fetch(url, { headers });
    console.log(`[yahoo] Response status: ${response.status}`);

    if (!response.ok) {
      console.error(`Yahoo Finance API error: ${response.status}`);
      return null;
    }

    const data: YahooChartResponse = await response.json();
    const result = data.chart?.result?.[0];
    const meta = result?.meta;

    if (!meta) {
      console.log(`[yahoo] No meta data in response for ${normalizedSymbol}`);
      return null;
    }

    const quote: StockQuote = {
      symbol: normalizedSymbol,
      name: meta.shortName || meta.longName || normalizedSymbol,
      price: meta.regularMarketPrice || 0,
      previousClose: meta.previousClose || 0,
      change: (meta.regularMarketPrice || 0) - (meta.previousClose || 0),
      changePercent: meta.previousClose
        ? (((meta.regularMarketPrice || 0) - meta.previousClose) / meta.previousClose) * 100
        : 0,
      open: meta.regularMarketOpen || 0,
      high: meta.regularMarketDayHigh || 0,
      low: meta.regularMarketDayLow || 0,
      volume: meta.regularMarketVolume || 0,
      marketCap: meta.marketCap,
      exchange: meta.exchange || 'JKT'
    };

    setCache(cacheKey, quote);
    return quote;
  } catch (error) {
    console.error(`Error fetching quote for ${normalizedSymbol}:`, error);
    return null;
  }
}

// Fetch historical daily prices
export async function fetchHistoricalDaily(
  symbol: string,
  from: Date,
  to: Date = new Date()
): Promise<HistoricalPrice[]> {
  const normalizedSymbol = normalizeSymbol(symbol);
  const cacheKey = `history:${normalizedSymbol}:${from.toISOString().split('T')[0]}:${to.toISOString().split('T')[0]}`;

  // Check cache
  const cached = getCached<HistoricalPrice[]>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const period1 = Math.floor(from.getTime() / 1000);
    const period2 = Math.floor(to.getTime() / 1000);

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalizedSymbol)}?period1=${period1}&period2=${period2}&interval=1d&events=history`;

    const response = await fetch(url, { headers });

    if (!response.ok) {
      console.error(`Yahoo Finance API error: ${response.status}`);
      return [];
    }

    const data: YahooChartResponse = await response.json();
    const result = data.chart?.result?.[0];

    if (!result?.timestamp || !result?.indicators?.quote?.[0]) {
      return [];
    }

    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];
    const adjclose = result.indicators.adjclose?.[0]?.adjclose;

    const prices: HistoricalPrice[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const open = quote.open?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      const close = quote.close?.[i];
      const volume = quote.volume?.[i];

      if (open != null && high != null && low != null && close != null) {
        prices.push({
          date: new Date(timestamps[i] * 1000),
          open,
          high,
          low,
          close,
          volume: volume || 0,
          adjClose: adjclose?.[i] ?? undefined
        });
      }
    }

    // Cache for longer since historical data doesn't change
    setCache(cacheKey, prices, 60 * 60 * 1000); // 1 hour
    return prices;
  } catch (error) {
    console.error(`Error fetching history for ${normalizedSymbol}:`, error);
    return [];
  }
}

// Search for stocks
export async function searchStocks(query: string): Promise<{ symbol: string; name: string }[]> {
  const cacheKey = `search:${query.toLowerCase()}`;

  // Check cache
  const cached = getCached<{ symbol: string; name: string }[]>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // First, search with original query
    let url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=20&newsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`;

    let response = await fetch(url, { headers });

    if (!response.ok) {
      console.error(`Yahoo Finance search error: ${response.status}`);
      return [];
    }

    let data: YahooSearchResponse = await response.json();

    let stocks = (data.quotes || [])
      .filter((q) => {
        // Filter for Indonesian stocks (.JK)
        const symbol = q.symbol || '';
        return symbol.endsWith('.JK');
      })
      .map((q) => ({
        symbol: q.symbol || '',
        name: q.shortname || q.longname || q.symbol || ''
      }))
      .slice(0, 10);

    // If no Indonesian stocks found and query doesn't already have .JK, try with .JK suffix
    if (stocks.length === 0 && !query.toUpperCase().endsWith('.JK')) {
      const jkQuery = `${query}.JK`;
      url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(jkQuery)}&quotesCount=20&newsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`;
      
      response = await fetch(url, { headers });
      
      if (response.ok) {
        data = await response.json();
        stocks = (data.quotes || [])
          .filter((q) => {
            const symbol = q.symbol || '';
            return symbol.endsWith('.JK');
          })
          .map((q) => ({
            symbol: q.symbol || '',
            name: q.shortname || q.longname || q.symbol || ''
          }))
          .slice(0, 10);
      }
    }

    setCache(cacheKey, stocks);
    return stocks;
  } catch (error) {
    console.error(`Error searching for ${query}:`, error);
    return [];
  }
}

// Fetch multiple quotes at once
export async function fetchMultipleQuotes(symbols: string[]): Promise<Map<string, StockQuote>> {
  const results = new Map<string, StockQuote>();

  // Fetch quotes in parallel with rate limiting
  const batchSize = 5;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const promises = batch.map((s) => fetchLatestQuote(s));
    const quotes = await Promise.all(promises);

    quotes.forEach((quote, idx) => {
      if (quote) {
        results.set(batch[idx], quote);
      }
    });

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < symbols.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}

// Get number of days for historical data needed for Wyckoff analysis
export function getHistoryDaysNeeded(): number {
  // Need at least 200 days for MA200
  // Plus some buffer for calculations
  return 250;
}
