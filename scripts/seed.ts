import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../src/lib/server/db/schema';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

async function seed() {
  console.log('Seeding database...');

  const sql = neon(DATABASE_URL);
  const db = drizzle(sql, { schema });

  try {
    // Create tables using raw SQL
    await sql`
      CREATE TABLE IF NOT EXISTS tickers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        symbol TEXT UNIQUE NOT NULL,
        name TEXT,
        exchange TEXT DEFAULT 'IDX',
        sector TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS prices_daily (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticker_id UUID REFERENCES tickers(id),
        date DATE NOT NULL,
        open NUMERIC,
        high NUMERIC,
        low NUMERIC,
        close NUMERIC,
        volume BIGINT,
        UNIQUE(ticker_id, date)
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS search_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticker_id UUID REFERENCES tickers(id),
        session_id TEXT NOT NULL,
        searched_at TIMESTAMPTZ DEFAULT NOW(),
        notes TEXT,
        UNIQUE(ticker_id, session_id)
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS wyckoff_analysis (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticker_id UUID REFERENCES tickers(id),
        date DATE NOT NULL,
        phase TEXT NOT NULL,
        sub_phase TEXT,
        strength NUMERIC,
        target_price NUMERIC,
        cut_loss_price NUMERIC,
        support_level NUMERIC,
        resistance_level NUMERIC,
        analysis_notes TEXT,
        UNIQUE(ticker_id, date)
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS metrics_daily (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticker_id UUID REFERENCES tickers(id),
        date DATE NOT NULL,
        ma_20 NUMERIC,
        ma_50 NUMERIC,
        ma_200 NUMERIC,
        rsi_14 NUMERIC,
        mfi_14 NUMERIC,
        macd_line NUMERIC,
        macd_signal NUMERIC,
        macd_histogram NUMERIC,
        volume_avg_20 BIGINT,
        volume_ratio NUMERIC,
        UNIQUE(ticker_id, date)
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS foreign_flow (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticker_id UUID REFERENCES tickers(id),
        date DATE NOT NULL,
        foreign_buy BIGINT,
        foreign_sell BIGINT,
        foreign_net BIGINT,
        foreign_buy_value NUMERIC,
        foreign_sell_value NUMERIC,
        foreign_net_value NUMERIC,
        UNIQUE(ticker_id, date)
      )
    `;

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_prices_daily_ticker_date ON prices_daily(ticker_id, date)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_search_history_session ON search_history(session_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_wyckoff_analysis_ticker_date ON wyckoff_analysis(ticker_id, date)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_metrics_daily_ticker_date ON metrics_daily(ticker_id, date)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_foreign_flow_ticker_date ON foreign_flow(ticker_id, date)`;

    console.log('Tables created successfully!');

    // Optionally seed some popular Indonesian stocks
    const popularStocks = [
      { symbol: 'BBCA.JK', name: 'Bank Central Asia Tbk' },
      { symbol: 'BBRI.JK', name: 'Bank Rakyat Indonesia Tbk' },
      { symbol: 'BMRI.JK', name: 'Bank Mandiri Tbk' },
      { symbol: 'TLKM.JK', name: 'Telkom Indonesia Tbk' },
      { symbol: 'ASII.JK', name: 'Astra International Tbk' },
      { symbol: 'UNVR.JK', name: 'Unilever Indonesia Tbk' },
      { symbol: 'GOTO.JK', name: 'GoTo Gojek Tokopedia Tbk' },
      { symbol: 'BUKA.JK', name: 'Bukalapak.com Tbk' },
      { symbol: 'ANTM.JK', name: 'Aneka Tambang Tbk' },
      { symbol: 'INDF.JK', name: 'Indofood Sukses Makmur Tbk' }
    ];

    for (const stock of popularStocks) {
      await sql`
        INSERT INTO tickers (symbol, name, exchange)
        VALUES (${stock.symbol}, ${stock.name}, 'IDX')
        ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name
      `;
    }

    console.log('Seeded popular Indonesian stocks');
    console.log('Database seeding completed!');
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
}

seed();
