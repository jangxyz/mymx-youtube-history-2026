import type Database from 'better-sqlite3';
import type {
  StoredWatchHistoryEntry,
  InsertWatchHistoryEntry,
  QueryOptions,
  BulkInsertResult,
} from './types.js';

/**
 * Watch history repository for database operations
 */
export class WatchHistoryRepository {
  private db: Database.Database;
  private insertStmt: Database.Statement;
  private getByIdStmt: Database.Statement;
  private getByVideoIdStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;

    // Prepare commonly used statements
    this.insertStmt = db.prepare(`
      INSERT OR IGNORE INTO watch_history
        (video_id, title, channel_name, channel_url, watched_at, thumbnail_url, video_url, is_ad, source)
      VALUES
        (@videoId, @title, @channelName, @channelUrl, @watchedAt, @thumbnailUrl, @url, @isAd, @source)
    `);

    this.getByIdStmt = db.prepare('SELECT * FROM watch_history WHERE id = ?');
    this.getByVideoIdStmt = db.prepare(
      'SELECT * FROM watch_history WHERE video_id = ? ORDER BY watched_at DESC'
    );
  }

  /**
   * Insert a single watch history entry
   * Returns true if inserted, false if duplicate
   */
  insert(entry: InsertWatchHistoryEntry): boolean {
    const result = this.insertStmt.run({
      videoId: entry.videoId,
      title: entry.title,
      channelName: entry.channelName,
      channelUrl: entry.channelUrl,
      watchedAt: entry.watchedAt,
      thumbnailUrl: entry.thumbnailUrl,
      url: entry.url,
      isAd: entry.isAd ? 1 : 0,
      source: entry.source,
    });
    return result.changes > 0;
  }

  /**
   * Bulk insert watch history entries (transactional)
   */
  bulkInsert(entries: InsertWatchHistoryEntry[]): BulkInsertResult {
    let inserted = 0;
    let duplicates = 0;
    const errors: Array<{ index: number; message: string }> = [];

    const insertMany = this.db.transaction(
      (items: InsertWatchHistoryEntry[]) => {
        for (let i = 0; i < items.length; i++) {
          try {
            const wasInserted = this.insert(items[i]);
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
      }
    );

    insertMany(entries);

    return { inserted, duplicates, errors };
  }

  /**
   * Get entry by database ID
   */
  getById(id: number): StoredWatchHistoryEntry | null {
    const row = this.getByIdStmt.get(id) as DbRow | undefined;
    return row ? this.mapRowToEntry(row) : null;
  }

  /**
   * Get all entries for a video ID
   */
  getByVideoId(videoId: string): StoredWatchHistoryEntry[] {
    const rows = this.getByVideoIdStmt.all(videoId) as DbRow[];
    return rows.map((row) => this.mapRowToEntry(row));
  }

  /**
   * Query watch history with filters and pagination
   */
  query(options: QueryOptions = {}): StoredWatchHistoryEntry[] {
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

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (!includeAds) {
      conditions.push('is_ad = 0');
    }

    if (search) {
      conditions.push('(title LIKE @search OR channel_name LIKE @search)');
      params.search = `%${search}%`;
    }

    if (dateFrom) {
      conditions.push('watched_at >= @dateFrom');
      params.dateFrom = dateFrom;
    }

    if (dateTo) {
      conditions.push('watched_at <= @dateTo');
      params.dateTo = dateTo;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const orderColumn = {
      watchedAt: 'watched_at',
      title: 'title',
      channelName: 'channel_name',
    }[orderBy];

    const sql = `
      SELECT * FROM watch_history
      ${whereClause}
      ORDER BY ${orderColumn} ${orderDir.toUpperCase()}
      LIMIT @limit OFFSET @offset
    `;

    const stmt = this.db.prepare(sql);
    const rows = stmt.all({ ...params, limit, offset }) as DbRow[];
    return rows.map((row) => this.mapRowToEntry(row));
  }

  /**
   * Count total entries matching query
   */
  count(options: Omit<QueryOptions, 'limit' | 'offset' | 'orderBy' | 'orderDir'> = {}): number {
    const { search, dateFrom, dateTo, includeAds = true } = options;

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (!includeAds) {
      conditions.push('is_ad = 0');
    }

    if (search) {
      conditions.push('(title LIKE @search OR channel_name LIKE @search)');
      params.search = `%${search}%`;
    }

    if (dateFrom) {
      conditions.push('watched_at >= @dateFrom');
      params.dateFrom = dateFrom;
    }

    if (dateTo) {
      conditions.push('watched_at <= @dateTo');
      params.dateTo = dateTo;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `SELECT COUNT(*) as count FROM watch_history ${whereClause}`;
    const stmt = this.db.prepare(sql);
    const result = stmt.get(params) as { count: number };
    return result.count;
  }

  /**
   * Get the most recent watch timestamp
   */
  getLatestWatchedAt(): string | null {
    const result = this.db
      .prepare('SELECT MAX(watched_at) as latest FROM watch_history')
      .get() as { latest: string | null };
    return result.latest;
  }

  /**
   * Delete entry by ID
   */
  delete(id: number): boolean {
    const result = this.db
      .prepare('DELETE FROM watch_history WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  /**
   * Map database row to StoredWatchHistoryEntry
   */
  private mapRowToEntry(row: DbRow): StoredWatchHistoryEntry {
    return {
      id: row.id,
      videoId: row.video_id,
      title: row.title,
      channelName: row.channel_name,
      channelUrl: row.channel_url,
      watchedAt: row.watched_at,
      thumbnailUrl: row.thumbnail_url,
      url: row.video_url,
      isAd: row.is_ad === 1,
      source: row.source as 'takeout' | 'playwright',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * Database row shape
 */
interface DbRow {
  id: number;
  video_id: string;
  title: string;
  channel_name: string | null;
  channel_url: string | null;
  watched_at: string;
  thumbnail_url: string;
  video_url: string;
  is_ad: number;
  source: string;
  created_at: string;
  updated_at: string;
}
