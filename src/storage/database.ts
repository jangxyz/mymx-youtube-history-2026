import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as schema from './schema.js';

const require = createRequire(import.meta.url);

export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Check if running in Electron main process
 */
function isElectron(): boolean {
  return (
    typeof process !== 'undefined' &&
    typeof process.versions === 'object' &&
    !!process.versions.electron
  );
}

/**
 * Get the default database path in user data directory
 */
export function getDefaultDbPath(): string {
  if (isElectron()) {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'watch-history.db');
  }
  // Fallback for non-Electron environments (e.g., tests, CLI)
  return path.join(process.cwd(), 'watch-history.db');
}

/**
 * Initialize database with Drizzle ORM
 */
export function initDatabase(dbPath?: string): DrizzleDB {
  const sqlite = new Database(dbPath ?? getDefaultDbPath());

  // Enable foreign keys and WAL mode for better performance
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  // Run initial schema creation if needed
  ensureSchema(sqlite);

  return db;
}

/**
 * Ensure schema exists (for first run or migration)
 * Note: In production, use drizzle-kit migrations instead
 */
function ensureSchema(sqlite: Database.Database): void {
  // Check if tables exist
  const tableExists = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='watch_history'"
    )
    .get();

  if (!tableExists) {
    sqlite.exec(`
      -- Watch history entries
      CREATE TABLE IF NOT EXISTS watch_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id TEXT NOT NULL,
        title TEXT NOT NULL,
        channel_name TEXT,
        channel_url TEXT,
        watched_at TEXT NOT NULL,
        thumbnail_url TEXT,
        video_url TEXT NOT NULL,
        is_ad INTEGER DEFAULT 0,
        source TEXT NOT NULL CHECK(source IN ('takeout', 'playwright')),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(video_id, watched_at)
      );

      -- Indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_watch_history_watched_at ON watch_history(watched_at DESC);
      CREATE INDEX IF NOT EXISTS idx_watch_history_video_id ON watch_history(video_id);
      CREATE INDEX IF NOT EXISTS idx_watch_history_title ON watch_history(title);
      CREATE INDEX IF NOT EXISTS idx_watch_history_channel_name ON watch_history(channel_name);

      -- Metadata table for sync state
      CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      -- Set schema version
      INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('schema_version', '1');
    `);
  }
}

/**
 * Get the underlying better-sqlite3 instance from Drizzle
 * (useful for raw queries or closing)
 */
export function getUnderlyingDb(db: DrizzleDB): Database.Database {
  // Access the internal session to get the client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (db as any)._.session.client as Database.Database;
}

/**
 * Close database connection
 */
export function closeDatabase(db: DrizzleDB): void {
  getUnderlyingDb(db).close();
}
