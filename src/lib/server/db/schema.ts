import { pgTable, text, timestamp, numeric, bigint, date, uuid, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Tickers (stock metadata)
export const tickers = pgTable('tickers', {
  id: uuid('id').primaryKey().defaultRandom(),
  symbol: text('symbol').unique().notNull(), // e.g., 'BBCA.JK'
  name: text('name'),
  exchange: text('exchange').default('IDX'),
  sector: text('sector'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
});

export const tickersRelations = relations(tickers, ({ many }) => ({
  pricesDaily: many(pricesDaily),
  searchHistory: many(searchHistory),
  wyckoffAnalysis: many(wyckoffAnalysis),
  metricsDaily: many(metricsDaily),
  foreignFlow: many(foreignFlow)
}));

// Daily price data
export const pricesDaily = pgTable(
  'prices_daily',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tickerId: uuid('ticker_id').references(() => tickers.id),
    date: date('date').notNull(),
    open: numeric('open'),
    high: numeric('high'),
    low: numeric('low'),
    close: numeric('close'),
    volume: bigint('volume', { mode: 'number' })
  },
  (table) => ({
    tickerDateUnique: unique().on(table.tickerId, table.date)
  })
);

export const pricesDailyRelations = relations(pricesDaily, ({ one }) => ({
  ticker: one(tickers, {
    fields: [pricesDaily.tickerId],
    references: [tickers.id]
  })
}));

// Search history (user's watchlist)
export const searchHistory = pgTable(
  'search_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tickerId: uuid('ticker_id').references(() => tickers.id),
    sessionId: text('session_id').notNull(), // Browser session/device ID
    searchedAt: timestamp('searched_at', { withTimezone: true }).defaultNow(),
    notes: text('notes') // Optional user notes
  },
  (table) => ({
    tickerSessionUnique: unique().on(table.tickerId, table.sessionId)
  })
);

export const searchHistoryRelations = relations(searchHistory, ({ one }) => ({
  ticker: one(tickers, {
    fields: [searchHistory.tickerId],
    references: [tickers.id]
  })
}));

// Wyckoff analysis results
export const wyckoffAnalysis = pgTable(
  'wyckoff_analysis',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tickerId: uuid('ticker_id').references(() => tickers.id),
    date: date('date').notNull(),
    phase: text('phase').notNull(), // 'accumulation', 'markup', 'distribution', 'markdown'
    subPhase: text('sub_phase'), // 'A', 'B', 'C', 'D', 'E'
    strength: numeric('strength'), // 0-100 signal strength
    targetPrice: numeric('target_price'),
    cutLossPrice: numeric('cut_loss_price'),
    supportLevel: numeric('support_level'),
    resistanceLevel: numeric('resistance_level'),
    analysisNotes: text('analysis_notes')
  },
  (table) => ({
    tickerDateUnique: unique().on(table.tickerId, table.date)
  })
);

export const wyckoffAnalysisRelations = relations(wyckoffAnalysis, ({ one }) => ({
  ticker: one(tickers, {
    fields: [wyckoffAnalysis.tickerId],
    references: [tickers.id]
  })
}));

// Daily metrics (MA, RSI, MFI, MACD, volume analysis)
export const metricsDaily = pgTable(
  'metrics_daily',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tickerId: uuid('ticker_id').references(() => tickers.id),
    date: date('date').notNull(),
    ma20: numeric('ma_20'),
    ma50: numeric('ma_50'),
    ma200: numeric('ma_200'),
    rsi14: numeric('rsi_14'),
    mfi14: numeric('mfi_14'), // Money Flow Index (14-period)
    macdLine: numeric('macd_line'), // MACD line (12-26 EMA)
    macdSignal: numeric('macd_signal'), // Signal line (9 EMA of MACD)
    macdHistogram: numeric('macd_histogram'), // MACD - Signal
    volumeAvg20: bigint('volume_avg_20', { mode: 'number' }),
    volumeRatio: numeric('volume_ratio') // Today's volume / 20-day avg
  },
  (table) => ({
    tickerDateUnique: unique().on(table.tickerId, table.date)
  })
);

export const metricsDailyRelations = relations(metricsDaily, ({ one }) => ({
  ticker: one(tickers, {
    fields: [metricsDaily.tickerId],
    references: [tickers.id]
  })
}));

// Foreign flow data
export const foreignFlow = pgTable(
  'foreign_flow',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tickerId: uuid('ticker_id').references(() => tickers.id),
    date: date('date').notNull(),
    foreignBuy: bigint('foreign_buy', { mode: 'number' }), // Foreign buy volume (shares)
    foreignSell: bigint('foreign_sell', { mode: 'number' }), // Foreign sell volume (shares)
    foreignNet: bigint('foreign_net', { mode: 'number' }), // Net foreign (buy - sell)
    foreignBuyValue: numeric('foreign_buy_value'), // In IDR
    foreignSellValue: numeric('foreign_sell_value'),
    foreignNetValue: numeric('foreign_net_value')
  },
  (table) => ({
    tickerDateUnique: unique().on(table.tickerId, table.date)
  })
);

export const foreignFlowRelations = relations(foreignFlow, ({ one }) => ({
  ticker: one(tickers, {
    fields: [foreignFlow.tickerId],
    references: [tickers.id]
  })
}));

// Type exports
export type Ticker = typeof tickers.$inferSelect;
export type NewTicker = typeof tickers.$inferInsert;
export type PriceDaily = typeof pricesDaily.$inferSelect;
export type NewPriceDaily = typeof pricesDaily.$inferInsert;
export type SearchHistory = typeof searchHistory.$inferSelect;
export type NewSearchHistory = typeof searchHistory.$inferInsert;
export type WyckoffAnalysis = typeof wyckoffAnalysis.$inferSelect;
export type NewWyckoffAnalysis = typeof wyckoffAnalysis.$inferInsert;
export type MetricsDaily = typeof metricsDaily.$inferSelect;
export type NewMetricsDaily = typeof metricsDaily.$inferInsert;
export type ForeignFlow = typeof foreignFlow.$inferSelect;
export type NewForeignFlow = typeof foreignFlow.$inferInsert;

// Phase type
export type WyckoffPhase = 'accumulation' | 'markup' | 'distribution' | 'markdown';
export type WyckoffSubPhase = 'A' | 'B' | 'C' | 'D' | 'E';
