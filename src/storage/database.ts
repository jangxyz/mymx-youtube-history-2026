import Database from 'better-sqlite3';
import path from 'node:path';

const SCHEMA_VERSION = 1;

/**
 * Check if running in Electron main process
 */
function isElectron(): boolean {
  return typeof process !== 'undefined' &&
         typeof process.versions === 'object' &&
         !!process.versions.electron;
}

/**
 * Get the default database path in user data directory
 */
export function getDefaultDbPath(): string {
  if (isElectron()) {
    // Dynamic import to avoid issues when not in Electron
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'watch-history.db');
  }
  // Fallback for non-Electron environments (e.g., tests, CLI)
  return path.join(process.cwd(), 'watch-history.db');
}

/**
 * Initialize database with schema
 */
export function initDatabase(dbPath?: string): Database.Database {
  const db = new Database(dbPath ?? getDefaultDbPath());

  // Enable foreign keys and WAL mode for better performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Check schema version and migrate if needed
  const version = getSchemaVersion(db);
  if (version < SCHEMA_VERSION) {
    migrateSchema(db, version);
  }

  return db;
}

/**
 * Get current schema version
 */
function getSchemaVersion(db: Database.Database): number {
  try {
    const result = db
      .prepare("SELECT value FROM sync_meta WHERE key = 'schema_version'")
      .get() as { value: string } | undefined;
    return result ? parseInt(result.value, 10) : 0;
  } catch {
    // Table doesn't exist yet
    return 0;
  }
}

/**
 * Run schema migrations
 */
function migrateSchema(db: Database.Database, fromVersion: number): void {
  if (fromVersion < 1) {
    createInitialSchema(db);
  }

  // Future migrations would go here:
  // if (fromVersion < 2) { migrateToV2(db); }
}

/**
 * Create initial database schema
 */
function createInitialSchema(db: Database.Database): void {
  db.exec(`
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
 * Close database connection
 */
export function closeDatabase(db: Database.Database): void {
  db.close();
}
