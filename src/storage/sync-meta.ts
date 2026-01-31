import type Database from 'better-sqlite3';

/**
 * Sync metadata manager for tracking sync state
 */
export class SyncMetaManager {
  private db: Database.Database;
  private getStmt: Database.Statement;
  private setStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;
    this.getStmt = db.prepare('SELECT value FROM sync_meta WHERE key = ?');
    this.setStmt = db.prepare(
      'INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)'
    );
  }

  /**
   * Get a metadata value
   */
  get(key: string): string | null {
    const result = this.getStmt.get(key) as { value: string } | undefined;
    return result?.value ?? null;
  }

  /**
   * Set a metadata value
   */
  set(key: string, value: string): void {
    this.setStmt.run(key, value);
  }

  /**
   * Get last Takeout import timestamp
   */
  getLastTakeoutImport(): string | null {
    return this.get('last_takeout_import');
  }

  /**
   * Set last Takeout import timestamp
   */
  setLastTakeoutImport(timestamp: string): void {
    this.set('last_takeout_import', timestamp);
  }

  /**
   * Get last Playwright sync timestamp
   */
  getLastPlaywrightSync(): string | null {
    return this.get('last_playwright_sync');
  }

  /**
   * Set last Playwright sync timestamp
   */
  setLastPlaywrightSync(timestamp: string): void {
    this.set('last_playwright_sync', timestamp);
  }
}
