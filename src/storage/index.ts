export type {
  StoredWatchHistoryEntry,
  InsertWatchHistoryEntry,
  QueryOptions,
  BulkInsertResult,
} from './types.js';

export type { DrizzleDB } from './database.js';
export { initDatabase, closeDatabase, getDefaultDbPath } from './database.js';
export { WatchHistoryRepository } from './repository.js';
export { SyncMetaManager } from './sync-meta.js';
export { NotesRepository } from './notes-repository.js';
export { TagsRepository } from './tags-repository.js';
export { VideoTagsRepository } from './video-tags-repository.js';
export { ExportService } from './export-service.js';
export type { TagWithCount } from './tags-repository.js';
export type { ExportEntry, ExportResult, ImportResult } from './export-service.js';
export * as schema from './schema.js';
