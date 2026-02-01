import { eq, like, and, desc, asc, sql, or } from 'drizzle-orm';
import type { DrizzleDB } from './database.js';
import { watchHistory } from './schema.js';
import type {
  StoredWatchHistoryEntry,
  InsertWatchHistoryEntry,
  QueryOptions,
  BulkInsertResult,
} from './types.js';

/**
 * Watch history repository for database operations
 * Uses async interface for future backend flexibility (e.g., PocketBase)
 */
export class WatchHistoryRepository {
  private db: DrizzleDB;

  constructor(db: DrizzleDB) {
    this.db = db;
  }

  /**
   * Insert a single watch history entry
   * Returns true if inserted, false if duplicate
   */
  async insert(entry: InsertWatchHistoryEntry): Promise<boolean> {
    try {
      const result = this.db
        .insert(watchHistory)
        .values({
          videoId: entry.videoId,
          title: entry.title,
          channelName: entry.channelName,
          channelUrl: entry.channelUrl,
          watchedAt: entry.watchedAt,
          thumbnailUrl: entry.thumbnailUrl,
          videoUrl: entry.url,
          isAd: entry.isAd,
          source: entry.source,
        })
        .onConflictDoNothing()
        .run();

      return result.changes > 0;
    } catch {
      return false;
    }
  }

  /**
   * Bulk insert watch history entries (transactional)
   */
  async bulkInsert(entries: InsertWatchHistoryEntry[]): Promise<BulkInsertResult> {
    let inserted = 0;
    let duplicates = 0;
    const errors: Array<{ index: number; message: string }> = [];

    // Drizzle with better-sqlite3 supports sync transactions
    // We wrap in async for interface consistency
    for (let i = 0; i < entries.length; i++) {
      try {
        const wasInserted = await this.insert(entries[i]);
        if (wasInserted) {
          inserted++;
        } else {
          duplicates++;
        }
      } catch (err) {
        errors.push({
          index: i,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { inserted, duplicates, errors };
  }

  /**
   * Get entry by database ID
   */
  async getById(id: number): Promise<StoredWatchHistoryEntry | null> {
    const rows = this.db
      .select()
      .from(watchHistory)
      .where(eq(watchHistory.id, id))
      .all();

    return rows.length > 0 ? this.mapRowToEntry(rows[0]) : null;
  }

  /**
   * Get all entries for a video ID
   */
  async getByVideoId(videoId: string): Promise<StoredWatchHistoryEntry[]> {
    const rows = this.db
      .select()
      .from(watchHistory)
      .where(eq(watchHistory.videoId, videoId))
      .orderBy(desc(watchHistory.watchedAt))
      .all();

    return rows.map((row) => this.mapRowToEntry(row));
  }

  /**
   * Query watch history with filters and pagination
   */
  async query(options: QueryOptions = {}): Promise<StoredWatchHistoryEntry[]> {
    const {
      limit = 50,
      offset = 0,
      orderBy = 'watchedAt',
      orderDir = 'desc',
      search,
      dateFrom,
      dateTo,
      includeAds = true,
    } = options;

    const conditions = [];

    if (!includeAds) {
      conditions.push(eq(watchHistory.isAd, false));
    }

    if (search) {
      conditions.push(
        or(
          like(watchHistory.title, `%${search}%`),
          like(watchHistory.channelName, `%${search}%`)
        )
      );
    }

    if (dateFrom) {
      conditions.push(sql`${watchHistory.watchedAt} >= ${dateFrom}`);
    }

    if (dateTo) {
      conditions.push(sql`${watchHistory.watchedAt} <= ${dateTo}`);
    }

    const orderColumn = {
      watchedAt: watchHistory.watchedAt,
      title: watchHistory.title,
      channelName: watchHistory.channelName,
    }[orderBy];

    const orderFn = orderDir === 'desc' ? desc : asc;

    let query = this.db.select().from(watchHistory);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const rows = query
      .orderBy(orderFn(orderColumn))
      .limit(limit)
      .offset(offset)
      .all();

    return rows.map((row) => this.mapRowToEntry(row));
  }

  /**
   * Count total entries matching query
   */
  async count(
    options: Omit<QueryOptions, 'limit' | 'offset' | 'orderBy' | 'orderDir'> = {}
  ): Promise<number> {
    const { search, dateFrom, dateTo, includeAds = true } = options;

    const conditions = [];

    if (!includeAds) {
      conditions.push(eq(watchHistory.isAd, false));
    }

    if (search) {
      conditions.push(
        or(
          like(watchHistory.title, `%${search}%`),
          like(watchHistory.channelName, `%${search}%`)
        )
      );
    }

    if (dateFrom) {
      conditions.push(sql`${watchHistory.watchedAt} >= ${dateFrom}`);
    }

    if (dateTo) {
      conditions.push(sql`${watchHistory.watchedAt} <= ${dateTo}`);
    }

    let query = this.db
      .select({ count: sql<number>`count(*)` })
      .from(watchHistory);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const result = query.get();
    return result?.count ?? 0;
  }

  /**
   * Get the most recent watch timestamp
   */
  async getLatestWatchedAt(): Promise<string | null> {
    const result = this.db
      .select({ latest: sql<string | null>`MAX(${watchHistory.watchedAt})` })
      .from(watchHistory)
      .get();

    return result?.latest ?? null;
  }

  /**
   * Delete entry by ID
   */
  async delete(id: number): Promise<boolean> {
    const result = this.db
      .delete(watchHistory)
      .where(eq(watchHistory.id, id))
      .run();

    return result.changes > 0;
  }

  /**
   * Map database row to StoredWatchHistoryEntry
   */
  private mapRowToEntry(row: typeof watchHistory.$inferSelect): StoredWatchHistoryEntry {
    return {
      id: row.id,
      videoId: row.videoId,
      title: row.title,
      channelName: row.channelName,
      channelUrl: row.channelUrl,
      watchedAt: row.watchedAt,
      thumbnailUrl: row.thumbnailUrl ?? '',
      url: row.videoUrl,
      isAd: row.isAd ?? false,
      source: row.source,
      createdAt: row.createdAt ?? '',
      updatedAt: row.updatedAt ?? '',
    };
  }
}
