import { eq } from 'drizzle-orm';
import type { DrizzleDB } from './database.js';
import { syncMeta } from './schema.js';

/**
 * Sync metadata manager for tracking sync state
 * Uses async interface for consistency with repository
 */
export class SyncMetaManager {
  private db: DrizzleDB;

  constructor(db: DrizzleDB) {
    this.db = db;
  }

  /**
   * Get a metadata value
   */
  async get(key: string): Promise<string | null> {
    const result = this.db
      .select()
      .from(syncMeta)
      .where(eq(syncMeta.key, key))
      .get();

    return result?.value ?? null;
  }

  /**
   * Set a metadata value
   */
  async set(key: string, value: string): Promise<void> {
    this.db
      .insert(syncMeta)
      .values({ key, value })
      .onConflictDoUpdate({
        target: syncMeta.key,
        set: { value },
      })
      .run();
  }

  /**
   * Get last Takeout import timestamp
   */
  async getLastTakeoutImport(): Promise<string | null> {
    return this.get('last_takeout_import');
  }

  /**
   * Set last Takeout import timestamp
   */
  async setLastTakeoutImport(timestamp: string): Promise<void> {
    return this.set('last_takeout_import', timestamp);
  }

  /**
   * Get last Playwright sync timestamp
   */
  async getLastPlaywrightSync(): Promise<string | null> {
    return this.get('last_playwright_sync');
  }

  /**
   * Set last Playwright sync timestamp
   */
  async setLastPlaywrightSync(timestamp: string): Promise<void> {
    return this.set('last_playwright_sync', timestamp);
  }
}
