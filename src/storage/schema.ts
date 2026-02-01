import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core';

/**
 * Watch history entries table
 */
export const watchHistory = sqliteTable(
  'watch_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    videoId: text('video_id').notNull(),
    title: text('title').notNull(),
    channelName: text('channel_name'),
    channelUrl: text('channel_url'),
    watchedAt: text('watched_at').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    videoUrl: text('video_url').notNull(),
    isAd: integer('is_ad', { mode: 'boolean' }).default(false),
    source: text('source', { enum: ['takeout', 'playwright'] }).notNull(),
    createdAt: text('created_at').default("datetime('now')"),
    updatedAt: text('updated_at').default("datetime('now')"),
  },
  (table) => [
    index('idx_watch_history_watched_at').on(table.watchedAt),
    index('idx_watch_history_video_id').on(table.videoId),
    index('idx_watch_history_title').on(table.title),
    index('idx_watch_history_channel_name').on(table.channelName),
    unique('unique_video_watched').on(table.videoId, table.watchedAt),
  ]
);

/**
 * Sync metadata table (key-value store)
 */
export const syncMeta = sqliteTable('sync_meta', {
  key: text('key').primaryKey(),
  value: text('value'),
});

// Type exports inferred from schema
export type WatchHistoryRecord = typeof watchHistory.$inferSelect;
export type NewWatchHistoryRecord = typeof watchHistory.$inferInsert;
export type SyncMetaRecord = typeof syncMeta.$inferSelect;
