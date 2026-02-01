import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { WatchHistoryRepository } from './repository.js';
import { SyncMetaManager } from './sync-meta.js';
import { NotesRepository } from './notes-repository.js';
import { TagsRepository } from './tags-repository.js';
import { VideoTagsRepository } from './video-tags-repository.js';
import { ExportService } from './export-service.js';
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

describe('NotesRepository', () => {
  let db: DrizzleDB;
  let sqlite: Database.Database;
  let repo: WatchHistoryRepository;
  let notesRepo: NotesRepository;

  beforeEach(async () => {
    const testDb = createTestDb();
    db = testDb.db;
    sqlite = testDb.sqlite;
    repo = new WatchHistoryRepository(db);
    notesRepo = new NotesRepository(db);

    // Insert a video to attach notes to
    await repo.insert(createTestEntry({ videoId: 'vid1' }));
  });

  afterEach(() => {
    sqlite.close();
  });

  it('adds a note to a video', async () => {
    const entries = await repo.getByVideoId('vid1');
    const watchHistoryId = entries[0].id;

    const note = await notesRepo.add(watchHistoryId, 'This is a great video!');
    expect(note.content).toBe('This is a great video!');
    expect(note.watchHistoryId).toBe(watchHistoryId);
    expect(note.id).toBeDefined();
  });

  it('gets notes by watch history id', async () => {
    const entries = await repo.getByVideoId('vid1');
    const watchHistoryId = entries[0].id;

    await notesRepo.add(watchHistoryId, 'Note 1');
    await notesRepo.add(watchHistoryId, 'Note 2');

    const notes = await notesRepo.getByWatchHistoryId(watchHistoryId);
    expect(notes).toHaveLength(2);
  });

  it('updates a note', async () => {
    const entries = await repo.getByVideoId('vid1');
    const watchHistoryId = entries[0].id;

    const note = await notesRepo.add(watchHistoryId, 'Original content');
    const updated = await notesRepo.update(note.id, 'Updated content');

    expect(updated?.content).toBe('Updated content');
  });

  it('deletes a note', async () => {
    const entries = await repo.getByVideoId('vid1');
    const watchHistoryId = entries[0].id;

    const note = await notesRepo.add(watchHistoryId, 'To be deleted');
    const deleted = await notesRepo.delete(note.id);

    expect(deleted).toBe(true);
    expect(await notesRepo.getById(note.id)).toBeNull();
  });

  it('cascades delete when video is deleted', async () => {
    const entries = await repo.getByVideoId('vid1');
    const watchHistoryId = entries[0].id;

    await notesRepo.add(watchHistoryId, 'Will be cascade deleted');
    await repo.delete(watchHistoryId);

    const notes = await notesRepo.getByWatchHistoryId(watchHistoryId);
    expect(notes).toHaveLength(0);
  });
});

describe('TagsRepository', () => {
  let db: DrizzleDB;
  let sqlite: Database.Database;
  let tagsRepo: TagsRepository;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    sqlite = testDb.sqlite;
    tagsRepo = new TagsRepository(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  it('creates a tag', async () => {
    const tag = await tagsRepo.create('tutorial');
    expect(tag.name).toBe('tutorial');
    expect(tag.id).toBeDefined();
  });

  it('creates a tag with color', async () => {
    const tag = await tagsRepo.create('important', '#ff0000');
    expect(tag.name).toBe('important');
    expect(tag.color).toBe('#ff0000');
  });

  it('gets tag by id', async () => {
    const created = await tagsRepo.create('music');
    const found = await tagsRepo.getById(created.id);
    expect(found?.name).toBe('music');
  });

  it('gets tag by name', async () => {
    await tagsRepo.create('cooking');
    const found = await tagsRepo.getByName('cooking');
    expect(found?.name).toBe('cooking');
  });

  it('lists all tags', async () => {
    await tagsRepo.create('tag1');
    await tagsRepo.create('tag2');
    await tagsRepo.create('tag3');

    const tags = await tagsRepo.list();
    expect(tags).toHaveLength(3);
  });

  it('renames a tag', async () => {
    const tag = await tagsRepo.create('oldname');
    const renamed = await tagsRepo.rename(tag.id, 'newname');
    expect(renamed?.name).toBe('newname');
  });

  it('updates tag color', async () => {
    const tag = await tagsRepo.create('colorful');
    const updated = await tagsRepo.updateColor(tag.id, '#00ff00');
    expect(updated?.color).toBe('#00ff00');
  });

  it('deletes a tag', async () => {
    const tag = await tagsRepo.create('temporary');
    const deleted = await tagsRepo.delete(tag.id);
    expect(deleted).toBe(true);
    expect(await tagsRepo.getById(tag.id)).toBeNull();
  });

  it('checks if tag exists', async () => {
    await tagsRepo.create('exists');
    expect(await tagsRepo.exists('exists')).toBe(true);
    expect(await tagsRepo.exists('doesnotexist')).toBe(false);
  });

  it('gets or creates tag', async () => {
    const tag1 = await tagsRepo.getOrCreate('newTag');
    const tag2 = await tagsRepo.getOrCreate('newTag');
    expect(tag1.id).toBe(tag2.id);
  });

  it('enforces unique tag names', async () => {
    await tagsRepo.create('unique');
    await expect(tagsRepo.create('unique')).rejects.toThrow();
  });

  it('searches tags by name', async () => {
    await tagsRepo.create('programming');
    await tagsRepo.create('program-design');
    await tagsRepo.create('music');

    const results = await tagsRepo.search('program');
    expect(results).toHaveLength(2);
  });
});

describe('VideoTagsRepository', () => {
  let db: DrizzleDB;
  let sqlite: Database.Database;
  let repo: WatchHistoryRepository;
  let tagsRepo: TagsRepository;
  let videoTagsRepo: VideoTagsRepository;

  beforeEach(async () => {
    const testDb = createTestDb();
    db = testDb.db;
    sqlite = testDb.sqlite;
    repo = new WatchHistoryRepository(db);
    tagsRepo = new TagsRepository(db);
    videoTagsRepo = new VideoTagsRepository(db);

    // Insert test videos
    await repo.insert(createTestEntry({ videoId: 'vid1' }));
    await repo.insert(createTestEntry({ videoId: 'vid2' }));
  });

  afterEach(() => {
    sqlite.close();
  });

  it('assigns a tag to a video', async () => {
    const entries = await repo.getByVideoId('vid1');
    const watchHistoryId = entries[0].id;
    const tag = await tagsRepo.create('tutorial');

    const result = await videoTagsRepo.assign(watchHistoryId, tag.id);
    expect(result).toBe(true);

    const tags = await videoTagsRepo.getTagsForVideo(watchHistoryId);
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe('tutorial');
  });

  it('removes a tag from a video', async () => {
    const entries = await repo.getByVideoId('vid1');
    const watchHistoryId = entries[0].id;
    const tag = await tagsRepo.create('toRemove');

    await videoTagsRepo.assign(watchHistoryId, tag.id);
    const removed = await videoTagsRepo.remove(watchHistoryId, tag.id);

    expect(removed).toBe(true);
    expect(await videoTagsRepo.getTagsForVideo(watchHistoryId)).toHaveLength(0);
  });

  it('gets all tags for a video', async () => {
    const entries = await repo.getByVideoId('vid1');
    const watchHistoryId = entries[0].id;

    const tag1 = await tagsRepo.create('tag1');
    const tag2 = await tagsRepo.create('tag2');

    await videoTagsRepo.assign(watchHistoryId, tag1.id);
    await videoTagsRepo.assign(watchHistoryId, tag2.id);

    const tags = await videoTagsRepo.getTagsForVideo(watchHistoryId);
    expect(tags).toHaveLength(2);
  });

  it('sets all tags for a video (replaces existing)', async () => {
    const entries = await repo.getByVideoId('vid1');
    const watchHistoryId = entries[0].id;

    const tag1 = await tagsRepo.create('old');
    const tag2 = await tagsRepo.create('new1');
    const tag3 = await tagsRepo.create('new2');

    await videoTagsRepo.assign(watchHistoryId, tag1.id);
    await videoTagsRepo.setVideoTags(watchHistoryId, [tag2.id, tag3.id]);

    const tags = await videoTagsRepo.getTagsForVideo(watchHistoryId);
    expect(tags).toHaveLength(2);
    expect(tags.map((t) => t.name).sort()).toEqual(['new1', 'new2']);
  });

  it('bulk assigns a tag to multiple videos', async () => {
    const entries1 = await repo.getByVideoId('vid1');
    const entries2 = await repo.getByVideoId('vid2');
    const tag = await tagsRepo.create('bulkTag');

    const count = await videoTagsRepo.bulkAssign(
      [entries1[0].id, entries2[0].id],
      tag.id
    );

    expect(count).toBe(2);
    expect(await videoTagsRepo.hasTag(entries1[0].id, tag.id)).toBe(true);
    expect(await videoTagsRepo.hasTag(entries2[0].id, tag.id)).toBe(true);
  });

  it('checks if video has a tag', async () => {
    const entries = await repo.getByVideoId('vid1');
    const watchHistoryId = entries[0].id;
    const tag = await tagsRepo.create('checkMe');

    expect(await videoTagsRepo.hasTag(watchHistoryId, tag.id)).toBe(false);
    await videoTagsRepo.assign(watchHistoryId, tag.id);
    expect(await videoTagsRepo.hasTag(watchHistoryId, tag.id)).toBe(true);
  });

  it('counts videos with a tag', async () => {
    const entries1 = await repo.getByVideoId('vid1');
    const entries2 = await repo.getByVideoId('vid2');
    const tag = await tagsRepo.create('countMe');

    await videoTagsRepo.assign(entries1[0].id, tag.id);
    await videoTagsRepo.assign(entries2[0].id, tag.id);

    expect(await videoTagsRepo.countByTag(tag.id)).toBe(2);
  });

  it('cascades delete when video is deleted', async () => {
    const entries = await repo.getByVideoId('vid1');
    const watchHistoryId = entries[0].id;
    const tag = await tagsRepo.create('cascadeTest');

    await videoTagsRepo.assign(watchHistoryId, tag.id);
    await repo.delete(watchHistoryId);

    expect(await videoTagsRepo.countByTag(tag.id)).toBe(0);
  });

  it('cascades delete when tag is deleted', async () => {
    const entries = await repo.getByVideoId('vid1');
    const watchHistoryId = entries[0].id;
    const tag = await tagsRepo.create('toDelete');

    await videoTagsRepo.assign(watchHistoryId, tag.id);
    await tagsRepo.delete(tag.id);

    const tags = await videoTagsRepo.getTagsForVideo(watchHistoryId);
    expect(tags).toHaveLength(0);
  });
});

describe('WatchHistoryRepository - Tag Filtering', () => {
  let db: DrizzleDB;
  let sqlite: Database.Database;
  let repo: WatchHistoryRepository;
  let tagsRepo: TagsRepository;
  let videoTagsRepo: VideoTagsRepository;

  beforeEach(async () => {
    const testDb = createTestDb();
    db = testDb.db;
    sqlite = testDb.sqlite;
    repo = new WatchHistoryRepository(db);
    tagsRepo = new TagsRepository(db);
    videoTagsRepo = new VideoTagsRepository(db);

    // Insert test videos
    await repo.insert(createTestEntry({ videoId: 'vid1', title: 'Video 1' }));
    await repo.insert(createTestEntry({ videoId: 'vid2', title: 'Video 2' }));
    await repo.insert(createTestEntry({ videoId: 'vid3', title: 'Video 3' }));
  });

  afterEach(() => {
    sqlite.close();
  });

  it('filters by single tag', async () => {
    const entries1 = await repo.getByVideoId('vid1');
    const entries2 = await repo.getByVideoId('vid2');
    const tag = await tagsRepo.create('tutorial');

    await videoTagsRepo.assign(entries1[0].id, tag.id);
    await videoTagsRepo.assign(entries2[0].id, tag.id);

    const results = await repo.query({ tagIds: [tag.id] });
    expect(results).toHaveLength(2);
  });

  it('filters by multiple tags with OR logic', async () => {
    const entries1 = await repo.getByVideoId('vid1');
    const entries2 = await repo.getByVideoId('vid2');
    const tag1 = await tagsRepo.create('tag1');
    const tag2 = await tagsRepo.create('tag2');

    await videoTagsRepo.assign(entries1[0].id, tag1.id);
    await videoTagsRepo.assign(entries2[0].id, tag2.id);

    const results = await repo.query({ tagIds: [tag1.id, tag2.id], tagLogic: 'OR' });
    expect(results).toHaveLength(2);
  });

  it('filters by multiple tags with AND logic', async () => {
    const entries1 = await repo.getByVideoId('vid1');
    const entries2 = await repo.getByVideoId('vid2');
    const tag1 = await tagsRepo.create('programming');
    const tag2 = await tagsRepo.create('rust');

    // vid1 has both tags, vid2 has only one
    await videoTagsRepo.assign(entries1[0].id, tag1.id);
    await videoTagsRepo.assign(entries1[0].id, tag2.id);
    await videoTagsRepo.assign(entries2[0].id, tag1.id);

    const results = await repo.query({ tagIds: [tag1.id, tag2.id], tagLogic: 'AND' });
    expect(results).toHaveLength(1);
    expect(results[0].videoId).toBe('vid1');
  });

  it('returns empty array when no videos match tag', async () => {
    const tag = await tagsRepo.create('unused');
    const results = await repo.query({ tagIds: [tag.id] });
    expect(results).toHaveLength(0);
  });

  it('combines tag filter with search', async () => {
    const entries1 = await repo.getByVideoId('vid1');
    const entries2 = await repo.getByVideoId('vid2');
    const tag = await tagsRepo.create('searchable');

    await videoTagsRepo.assign(entries1[0].id, tag.id);
    await videoTagsRepo.assign(entries2[0].id, tag.id);

    const results = await repo.query({ tagIds: [tag.id], search: 'Video 1' });
    expect(results).toHaveLength(1);
    expect(results[0].videoId).toBe('vid1');
  });

  it('counts entries with tag filter', async () => {
    const entries1 = await repo.getByVideoId('vid1');
    const tag = await tagsRepo.create('countable');

    await videoTagsRepo.assign(entries1[0].id, tag.id);

    const count = await repo.count({ tagIds: [tag.id] });
    expect(count).toBe(1);
  });
});

describe('ExportService', () => {
  let db: DrizzleDB;
  let sqlite: Database.Database;
  let repo: WatchHistoryRepository;
  let notesRepo: NotesRepository;
  let tagsRepo: TagsRepository;
  let videoTagsRepo: VideoTagsRepository;
  let exportService: ExportService;

  beforeEach(async () => {
    const testDb = createTestDb();
    db = testDb.db;
    sqlite = testDb.sqlite;
    repo = new WatchHistoryRepository(db);
    notesRepo = new NotesRepository(db);
    tagsRepo = new TagsRepository(db);
    videoTagsRepo = new VideoTagsRepository(db);
    exportService = new ExportService(db);

    // Insert test video with notes and tags
    await repo.insert(createTestEntry({ videoId: 'vid1', title: 'Video 1' }));
    const entries = await repo.getByVideoId('vid1');
    const watchHistoryId = entries[0].id;

    await notesRepo.add(watchHistoryId, 'This is a great tutorial');
    await notesRepo.add(watchHistoryId, 'Watch at 5:30 for the key part');

    const tag1 = await tagsRepo.create('tutorial');
    const tag2 = await tagsRepo.create('programming');
    await videoTagsRepo.assign(watchHistoryId, tag1.id);
    await videoTagsRepo.assign(watchHistoryId, tag2.id);
  });

  afterEach(() => {
    sqlite.close();
  });

  it('exports entries with notes and tags', async () => {
    const result = await exportService.exportAll();

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].notes).toHaveLength(2);
    expect(result.entries[0].tags).toHaveLength(2);
    expect(result.entries[0].tags).toContain('tutorial');
    expect(result.entries[0].tags).toContain('programming');
  });

  it('includes correct stats', async () => {
    const result = await exportService.exportAll();

    expect(result.stats.totalEntries).toBe(1);
    expect(result.stats.entriesWithNotes).toBe(1);
    expect(result.stats.entriesWithTags).toBe(1);
    expect(result.stats.totalNotes).toBe(2);
    expect(result.stats.totalTags).toBe(2);
  });

  it('exports to JSONL format', async () => {
    const jsonl = await exportService.exportToJsonl();
    const lines = jsonl.split('\n');

    expect(lines).toHaveLength(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.videoId).toBe('vid1');
    expect(entry.notes).toHaveLength(2);
    expect(entry.tags).toHaveLength(2);
  });

  it('imports from JSONL format', async () => {
    // Export first
    const jsonl = await exportService.exportToJsonl();

    // Create a new database for import
    const newTestDb = createTestDb();
    const newExportService = new ExportService(newTestDb.db);

    // Import
    const result = await newExportService.importFromJsonl(jsonl);

    expect(result.imported).toBe(1);
    expect(result.notesCreated).toBe(2);
    expect(result.tagAssignments).toBe(2);

    // Verify data was imported
    const newRepo = new WatchHistoryRepository(newTestDb.db);
    const entries = await newRepo.getByVideoId('vid1');
    expect(entries).toHaveLength(1);

    const newNotesRepo = new NotesRepository(newTestDb.db);
    const notes = await newNotesRepo.getByWatchHistoryId(entries[0].id);
    expect(notes).toHaveLength(2);

    newTestDb.sqlite.close();
  });

  it('handles duplicate entries on import', async () => {
    const jsonl = await exportService.exportToJsonl();

    // Import into same database (should be duplicate)
    const result = await exportService.importFromJsonl(jsonl);

    expect(result.duplicates).toBe(1);
    expect(result.imported).toBe(0);
  });

  it('exports entries without annotations', async () => {
    // Add a video without notes or tags
    await repo.insert(createTestEntry({ videoId: 'vid2', title: 'Video 2' }));

    const result = await exportService.exportAll();

    expect(result.entries).toHaveLength(2);
    const vid2 = result.entries.find((e) => e.videoId === 'vid2');
    expect(vid2?.notes).toHaveLength(0);
    expect(vid2?.tags).toHaveLength(0);
  });
});
