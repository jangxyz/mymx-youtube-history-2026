import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { WatchHistoryRepository } from './repository.js';
import { SyncMetaManager } from './sync-meta.js';
import * as schema from './schema.js';
import type { InsertWatchHistoryEntry } from './types.js';
import type { DrizzleDB } from './database.js';

// Use in-memory database for tests
function createTestDb(): { db: DrizzleDB; sqlite: Database.Database } {
  const sqlite = new Database(':memory:');

  // Enable foreign keys
  sqlite.pragma('foreign_keys = ON');

  sqlite.exec(`
    CREATE TABLE watch_history (
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

    CREATE TABLE sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watch_history_id INTEGER NOT NULL REFERENCES watch_history(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_notes_watch_history_id ON notes(watch_history_id);

    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_tags_name ON tags(name);

    CREATE TABLE video_tags (
      watch_history_id INTEGER NOT NULL REFERENCES watch_history(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (watch_history_id, tag_id)
    );

    CREATE INDEX idx_video_tags_watch_history_id ON video_tags(watch_history_id);
    CREATE INDEX idx_video_tags_tag_id ON video_tags(tag_id);
  `);

  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

function createTestEntry(
  overrides: Partial<InsertWatchHistoryEntry> = {}
): InsertWatchHistoryEntry {
  return {
    videoId: 'test123',
    title: 'Test Video',
    url: 'https://www.youtube.com/watch?v=test123',
    channelName: 'Test Channel',
    channelUrl: 'https://www.youtube.com/channel/UC123',
    thumbnailUrl: 'https://i.ytimg.com/vi/test123/hqdefault.jpg',
    watchedAt: '2026-01-31T12:00:00.000Z',
    isAd: false,
    source: 'takeout',
    ...overrides,
  };
}

describe('WatchHistoryRepository', () => {
  let db: DrizzleDB;
  let sqlite: Database.Database;
  let repo: WatchHistoryRepository;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    sqlite = testDb.sqlite;
    repo = new WatchHistoryRepository(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('insert', () => {
    it('inserts a new entry', async () => {
      const entry = createTestEntry();
      const result = await repo.insert(entry);
      expect(result).toBe(true);

      const stored = await repo.getByVideoId('test123');
      expect(stored).toHaveLength(1);
      expect(stored[0].title).toBe('Test Video');
    });

    it('returns false for duplicate entry', async () => {
      const entry = createTestEntry();
      await repo.insert(entry);
      const result = await repo.insert(entry);
      expect(result).toBe(false);
    });

    it('allows same video with different timestamp', async () => {
      const entry1 = createTestEntry({ watchedAt: '2026-01-31T12:00:00.000Z' });
      const entry2 = createTestEntry({ watchedAt: '2026-01-31T14:00:00.000Z' });

      await repo.insert(entry1);
      const result = await repo.insert(entry2);
      expect(result).toBe(true);

      const stored = await repo.getByVideoId('test123');
      expect(stored).toHaveLength(2);
    });

    it('stores boolean isAd correctly', async () => {
      const adEntry = createTestEntry({ videoId: 'ad123', isAd: true });
      await repo.insert(adEntry);

      const stored = await repo.getByVideoId('ad123');
      expect(stored[0].isAd).toBe(true);
    });
  });

  describe('bulkInsert', () => {
    it('inserts multiple entries', async () => {
      const entries = [
        createTestEntry({ videoId: 'vid1' }),
        createTestEntry({ videoId: 'vid2' }),
        createTestEntry({ videoId: 'vid3' }),
      ];

      const result = await repo.bulkInsert(entries);
      expect(result.inserted).toBe(3);
      expect(result.duplicates).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('handles duplicates in bulk insert', async () => {
      const entry = createTestEntry({ videoId: 'vid1' });
      await repo.insert(entry);

      const entries = [
        createTestEntry({ videoId: 'vid1' }), // duplicate
        createTestEntry({ videoId: 'vid2' }), // new
      ];

      const result = await repo.bulkInsert(entries);
      expect(result.inserted).toBe(1);
      expect(result.duplicates).toBe(1);
    });

    it('is transactional', async () => {
      const entries = [
        createTestEntry({ videoId: 'vid1' }),
        createTestEntry({ videoId: 'vid2' }),
      ];

      await repo.bulkInsert(entries);
      expect(await repo.count()).toBe(2);
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      // Insert test data
      const entries = [
        createTestEntry({
          videoId: 'vid1',
          title: 'First Video',
          channelName: 'Channel A',
          watchedAt: '2026-01-31T10:00:00.000Z',
          isAd: false,
        }),
        createTestEntry({
          videoId: 'vid2',
          title: 'Second Video',
          channelName: 'Channel B',
          watchedAt: '2026-01-31T12:00:00.000Z',
          isAd: false,
        }),
        createTestEntry({
          videoId: 'vid3',
          title: 'Ad Video',
          channelName: 'Advertiser',
          watchedAt: '2026-01-31T14:00:00.000Z',
          isAd: true,
        }),
      ];
      await repo.bulkInsert(entries);
    });

    it('returns entries ordered by watched_at desc by default', async () => {
      const results = await repo.query();
      expect(results).toHaveLength(3);
      expect(results[0].videoId).toBe('vid3'); // most recent
      expect(results[2].videoId).toBe('vid1'); // oldest
    });

    it('supports limit and offset', async () => {
      const results = await repo.query({ limit: 1, offset: 1 });
      expect(results).toHaveLength(1);
      expect(results[0].videoId).toBe('vid2');
    });

    it('filters by search term (title)', async () => {
      const results = await repo.query({ search: 'First' });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('First Video');
    });

    it('filters by search term (channel)', async () => {
      const results = await repo.query({ search: 'Channel B' });
      expect(results).toHaveLength(1);
      expect(results[0].channelName).toBe('Channel B');
    });

    it('excludes ads when includeAds is false', async () => {
      const results = await repo.query({ includeAds: false });
      expect(results).toHaveLength(2);
      expect(results.every((r) => !r.isAd)).toBe(true);
    });

    it('filters by date range', async () => {
      const results = await repo.query({
        dateFrom: '2026-01-31T11:00:00.000Z',
        dateTo: '2026-01-31T13:00:00.000Z',
      });
      expect(results).toHaveLength(1);
      expect(results[0].videoId).toBe('vid2');
    });

    it('supports ascending order', async () => {
      const results = await repo.query({ orderDir: 'asc' });
      expect(results[0].videoId).toBe('vid1'); // oldest first
    });

    it('supports ordering by title', async () => {
      const results = await repo.query({ orderBy: 'title', orderDir: 'asc' });
      expect(results[0].title).toBe('Ad Video');
      expect(results[1].title).toBe('First Video');
      expect(results[2].title).toBe('Second Video');
    });
  });

  describe('count', () => {
    beforeEach(async () => {
      const entries = [
        createTestEntry({ videoId: 'vid1', isAd: false }),
        createTestEntry({ videoId: 'vid2', isAd: false }),
        createTestEntry({ videoId: 'vid3', isAd: true }),
      ];
      await repo.bulkInsert(entries);
    });

    it('returns total count', async () => {
      expect(await repo.count()).toBe(3);
    });

    it('respects filters', async () => {
      expect(await repo.count({ includeAds: false })).toBe(2);
    });
  });

  describe('getLatestWatchedAt', () => {
    it('returns null for empty database', async () => {
      expect(await repo.getLatestWatchedAt()).toBeNull();
    });

    it('returns most recent timestamp', async () => {
      await repo.bulkInsert([
        createTestEntry({ videoId: 'vid1', watchedAt: '2026-01-30T12:00:00.000Z' }),
        createTestEntry({ videoId: 'vid2', watchedAt: '2026-01-31T12:00:00.000Z' }),
      ]);

      expect(await repo.getLatestWatchedAt()).toBe('2026-01-31T12:00:00.000Z');
    });
  });

  describe('delete', () => {
    it('deletes entry by id', async () => {
      await repo.insert(createTestEntry({ videoId: 'vid1' }));
      const entries = await repo.getByVideoId('vid1');
      const id = entries[0].id;

      const result = await repo.delete(id);
      expect(result).toBe(true);
      expect(await repo.getById(id)).toBeNull();
    });

    it('returns false for non-existent id', async () => {
      expect(await repo.delete(999)).toBe(false);
    });
  });
});

describe('SyncMetaManager', () => {
  let db: DrizzleDB;
  let sqlite: Database.Database;
  let meta: SyncMetaManager;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    sqlite = testDb.sqlite;
    meta = new SyncMetaManager(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  it('gets and sets values', async () => {
    await meta.set('test_key', 'test_value');
    expect(await meta.get('test_key')).toBe('test_value');
  });

  it('returns null for non-existent key', async () => {
    expect(await meta.get('non_existent')).toBeNull();
  });

  it('tracks last takeout import', async () => {
    const timestamp = '2026-01-31T12:00:00.000Z';
    await meta.setLastTakeoutImport(timestamp);
    expect(await meta.getLastTakeoutImport()).toBe(timestamp);
  });

  it('tracks last playwright sync', async () => {
    const timestamp = '2026-01-31T14:00:00.000Z';
    await meta.setLastPlaywrightSync(timestamp);
    expect(await meta.getLastPlaywrightSync()).toBe(timestamp);
  });
});
