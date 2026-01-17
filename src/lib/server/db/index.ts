import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Create database connection
export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

// Type for the database instance
export type Database = ReturnType<typeof createDb>;

// Helper to get DB from platform env
export function getDb(platform: App.Platform | undefined): Database {
  const databaseUrl = platform?.env?.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not configured');
  }
  return createDb(databaseUrl);
}

// Re-export schema
export * from './schema';
