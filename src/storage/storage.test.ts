import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { WatchHistoryRepository } from './repository.js';
import { SyncMetaManager } from './sync-meta.js';
import type { InsertWatchHistoryEntry } from './types.js';

// Use in-memory database for tests
function createTestDb(): Database.Database {
  const db = new Database(':memory:');

  db.exec(`
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
  `);

  return db;
}

function createTestEntry(overrides: Partial<InsertWatchHistoryEntry> = {}): InsertWatchHistoryEntry {
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
  let db: Database.Database;
  let repo: WatchHistoryRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new WatchHistoryRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('insert', () => {
    it('inserts a new entry', () => {
      const entry = createTestEntry();
      const result = repo.insert(entry);
      expect(result).toBe(true);

      const stored = repo.getByVideoId('test123');
      expect(stored).toHaveLength(1);
      expect(stored[0].title).toBe('Test Video');
    });

    it('returns false for duplicate entry', () => {
      const entry = createTestEntry();
      repo.insert(entry);
      const result = repo.insert(entry);
      expect(result).toBe(false);
    });

    it('allows same video with different timestamp', () => {
      const entry1 = createTestEntry({ watchedAt: '2026-01-31T12:00:00.000Z' });
      const entry2 = createTestEntry({ watchedAt: '2026-01-31T14:00:00.000Z' });

      repo.insert(entry1);
      const result = repo.insert(entry2);
      expect(result).toBe(true);

      const stored = repo.getByVideoId('test123');
      expect(stored).toHaveLength(2);
    });

    it('stores boolean isAd correctly', () => {
      const adEntry = createTestEntry({ videoId: 'ad123', isAd: true });
      repo.insert(adEntry);

      const stored = repo.getByVideoId('ad123');
      expect(stored[0].isAd).toBe(true);
    });
  });

  describe('bulkInsert', () => {
    it('inserts multiple entries', () => {
      const entries = [
        createTestEntry({ videoId: 'vid1' }),
        createTestEntry({ videoId: 'vid2' }),
        createTestEntry({ videoId: 'vid3' }),
      ];

      const result = repo.bulkInsert(entries);
      expect(result.inserted).toBe(3);
      expect(result.duplicates).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('handles duplicates in bulk insert', () => {
      const entry = createTestEntry({ videoId: 'vid1' });
      repo.insert(entry);

      const entries = [
        createTestEntry({ videoId: 'vid1' }), // duplicate
        createTestEntry({ videoId: 'vid2' }), // new
      ];

      const result = repo.bulkInsert(entries);
      expect(result.inserted).toBe(1);
      expect(result.duplicates).toBe(1);
    });

    it('is transactional', () => {
      const entries = [
        createTestEntry({ videoId: 'vid1' }),
        createTestEntry({ videoId: 'vid2' }),
      ];

      repo.bulkInsert(entries);
      expect(repo.count()).toBe(2);
    });
  });

  describe('query', () => {
    beforeEach(() => {
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
      repo.bulkInsert(entries);
    });

    it('returns entries ordered by watched_at desc by default', () => {
      const results = repo.query();
      expect(results).toHaveLength(3);
      expect(results[0].videoId).toBe('vid3'); // most recent
      expect(results[2].videoId).toBe('vid1'); // oldest
    });

    it('supports limit and offset', () => {
      const results = repo.query({ limit: 1, offset: 1 });
      expect(results).toHaveLength(1);
      expect(results[0].videoId).toBe('vid2');
    });

    it('filters by search term (title)', () => {
      const results = repo.query({ search: 'First' });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('First Video');
    });

    it('filters by search term (channel)', () => {
      const results = repo.query({ search: 'Channel B' });
      expect(results).toHaveLength(1);
      expect(results[0].channelName).toBe('Channel B');
    });

    it('excludes ads when includeAds is false', () => {
      const results = repo.query({ includeAds: false });
      expect(results).toHaveLength(2);
      expect(results.every((r) => !r.isAd)).toBe(true);
    });

    it('filters by date range', () => {
      const results = repo.query({
        dateFrom: '2026-01-31T11:00:00.000Z',
        dateTo: '2026-01-31T13:00:00.000Z',
      });
      expect(results).toHaveLength(1);
      expect(results[0].videoId).toBe('vid2');
    });

    it('supports ascending order', () => {
      const results = repo.query({ orderDir: 'asc' });
      expect(results[0].videoId).toBe('vid1'); // oldest first
    });

    it('supports ordering by title', () => {
      const results = repo.query({ orderBy: 'title', orderDir: 'asc' });
      expect(results[0].title).toBe('Ad Video');
      expect(results[1].title).toBe('First Video');
      expect(results[2].title).toBe('Second Video');
    });
  });

  describe('count', () => {
    beforeEach(() => {
      const entries = [
        createTestEntry({ videoId: 'vid1', isAd: false }),
        createTestEntry({ videoId: 'vid2', isAd: false }),
        createTestEntry({ videoId: 'vid3', isAd: true }),
      ];
      repo.bulkInsert(entries);
    });

    it('returns total count', () => {
      expect(repo.count()).toBe(3);
    });

    it('respects filters', () => {
      expect(repo.count({ includeAds: false })).toBe(2);
    });
  });

  describe('getLatestWatchedAt', () => {
    it('returns null for empty database', () => {
      expect(repo.getLatestWatchedAt()).toBeNull();
    });

    it('returns most recent timestamp', () => {
      repo.bulkInsert([
        createTestEntry({ videoId: 'vid1', watchedAt: '2026-01-30T12:00:00.000Z' }),
        createTestEntry({ videoId: 'vid2', watchedAt: '2026-01-31T12:00:00.000Z' }),
      ]);

      expect(repo.getLatestWatchedAt()).toBe('2026-01-31T12:00:00.000Z');
    });
  });

  describe('delete', () => {
    it('deletes entry by id', () => {
      repo.insert(createTestEntry({ videoId: 'vid1' }));
      const entries = repo.getByVideoId('vid1');
      const id = entries[0].id;

      const result = repo.delete(id);
      expect(result).toBe(true);
      expect(repo.getById(id)).toBeNull();
    });

    it('returns false for non-existent id', () => {
      expect(repo.delete(999)).toBe(false);
    });
  });
});

describe('SyncMetaManager', () => {
  let db: Database.Database;
  let meta: SyncMetaManager;

  beforeEach(() => {
    db = createTestDb();
    meta = new SyncMetaManager(db);
  });

  afterEach(() => {
    db.close();
  });

  it('gets and sets values', () => {
    meta.set('test_key', 'test_value');
    expect(meta.get('test_key')).toBe('test_value');
  });

  it('returns null for non-existent key', () => {
    expect(meta.get('non_existent')).toBeNull();
  });

  it('tracks last takeout import', () => {
    const timestamp = '2026-01-31T12:00:00.000Z';
    meta.setLastTakeoutImport(timestamp);
    expect(meta.getLastTakeoutImport()).toBe(timestamp);
  });

  it('tracks last playwright sync', () => {
    const timestamp = '2026-01-31T14:00:00.000Z';
    meta.setLastPlaywrightSync(timestamp);
    expect(meta.getLastPlaywrightSync()).toBe(timestamp);
  });
});
