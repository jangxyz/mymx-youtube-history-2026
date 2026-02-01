import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as schema from './schema.js';

const require = createRequire(import.meta.url);

export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

// Store sqlite instances for cleanup
const sqliteInstances = new WeakMap<DrizzleDB, Database.Database>();

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

  // Store reference for cleanup
  sqliteInstances.set(db, sqlite);

  // Run initial schema creation if needed
  ensureSchema(sqlite);

  return db;
}

const SCHEMA_VERSION = 2;

/**
 * Ensure schema exists and run migrations
 */
function ensureSchema(sqlite: Database.Database): void {
  const currentVersion = getSchemaVersion(sqlite);

  if (currentVersion < 1) {
    migrateToV1(sqlite);
  }

  if (currentVersion < 2) {
    migrateToV2(sqlite);
  }
}

/**
 * Get current schema version from database
 */
function getSchemaVersion(sqlite: Database.Database): number {
  try {
    const result = sqlite
      .prepare("SELECT value FROM sync_meta WHERE key = 'schema_version'")
      .get() as { value: string } | undefined;
    return result ? parseInt(result.value, 10) : 0;
  } catch {
    // Table doesn't exist yet
    return 0;
  }
}

/**
 * Migration to v1: Initial schema
 */
function migrateToV1(sqlite: Database.Database): void {
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

/**
 * Migration to v2: Add notes, tags, and video_tags tables
 */
function migrateToV2(sqlite: Database.Database): void {
  sqlite.exec(`
    -- Notes table for free-form text notes on videos
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watch_history_id INTEGER NOT NULL REFERENCES watch_history(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_notes_watch_history_id ON notes(watch_history_id);

    -- Tags table for user-defined labels
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

    -- Video-Tags junction table for many-to-many relationship
    CREATE TABLE IF NOT EXISTS video_tags (
      watch_history_id INTEGER NOT NULL REFERENCES watch_history(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (watch_history_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS idx_video_tags_watch_history_id ON video_tags(watch_history_id);
    CREATE INDEX IF NOT EXISTS idx_video_tags_tag_id ON video_tags(tag_id);

    -- Update schema version
    INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('schema_version', '2');
  `);
}

/**
 * Get the underlying better-sqlite3 instance from Drizzle
 * (useful for raw queries or closing)
 */
export function getUnderlyingDb(db: DrizzleDB): Database.Database | undefined {
  return sqliteInstances.get(db);
}

/**
 * Close database connection
 */
export function closeDatabase(db: DrizzleDB): void {
  const sqlite = sqliteInstances.get(db);
  if (sqlite) {
    sqlite.close();
    sqliteInstances.delete(db);
  }
}
