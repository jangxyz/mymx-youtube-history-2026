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
export * as schema from './schema.js';
