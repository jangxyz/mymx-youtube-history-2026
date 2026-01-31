export type {
  StoredWatchHistoryEntry,
  InsertWatchHistoryEntry,
  QueryOptions,
  BulkInsertResult,
} from './types.js';

export { initDatabase, closeDatabase, getDefaultDbPath } from './database.js';
export { WatchHistoryRepository } from './repository.js';
export { SyncMetaManager } from './sync-meta.js';
