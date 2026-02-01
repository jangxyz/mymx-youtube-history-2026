import { sqliteTable, text, integer, index, unique, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

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

/**
 * Notes table - free-form text notes on videos
 */
export const notes = sqliteTable(
  'notes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    watchHistoryId: integer('watch_history_id')
      .notNull()
      .references(() => watchHistory.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: text('created_at').default("datetime('now')"),
    updatedAt: text('updated_at').default("datetime('now')"),
  },
  (table) => [
    index('idx_notes_watch_history_id').on(table.watchHistoryId),
  ]
);

/**
 * Tags table - user-defined labels
 */
export const tags = sqliteTable(
  'tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull().unique(),
    color: text('color'), // Optional hex color for UI
    createdAt: text('created_at').default("datetime('now')"),
  },
  (table) => [
    index('idx_tags_name').on(table.name),
  ]
);

/**
 * Video-Tags junction table - many-to-many relationship
 */
export const videoTags = sqliteTable(
  'video_tags',
  {
    watchHistoryId: integer('watch_history_id')
      .notNull()
      .references(() => watchHistory.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').default("datetime('now')"),
  },
  (table) => [
    primaryKey({ columns: [table.watchHistoryId, table.tagId] }),
    index('idx_video_tags_watch_history_id').on(table.watchHistoryId),
    index('idx_video_tags_tag_id').on(table.tagId),
  ]
);

// Relations for Drizzle query builder
export const watchHistoryRelations = relations(watchHistory, ({ many }) => ({
  notes: many(notes),
  videoTags: many(videoTags),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  watchHistory: one(watchHistory, {
    fields: [notes.watchHistoryId],
    references: [watchHistory.id],
  }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  videoTags: many(videoTags),
}));

export const videoTagsRelations = relations(videoTags, ({ one }) => ({
  watchHistory: one(watchHistory, {
    fields: [videoTags.watchHistoryId],
    references: [watchHistory.id],
  }),
  tag: one(tags, {
    fields: [videoTags.tagId],
    references: [tags.id],
  }),
}));

// Type exports inferred from schema
export type WatchHistoryRecord = typeof watchHistory.$inferSelect;
export type NewWatchHistoryRecord = typeof watchHistory.$inferInsert;
export type SyncMetaRecord = typeof syncMeta.$inferSelect;
export type NoteRecord = typeof notes.$inferSelect;
export type NewNoteRecord = typeof notes.$inferInsert;
export type TagRecord = typeof tags.$inferSelect;
export type NewTagRecord = typeof tags.$inferInsert;
export type VideoTagRecord = typeof videoTags.$inferSelect;
export type NewVideoTagRecord = typeof videoTags.$inferInsert;
