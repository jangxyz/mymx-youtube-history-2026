import type { WatchHistoryEntry } from '../parser/types.js';

/**
 * Watch history entry as stored in database
 */
export interface StoredWatchHistoryEntry extends WatchHistoryEntry {
  id: number;
  source: 'takeout' | 'playwright';
  createdAt: string;
  updatedAt: string;
}

/**
 * Entry to be inserted (without auto-generated fields)
 */
export interface InsertWatchHistoryEntry extends WatchHistoryEntry {
  source: 'takeout' | 'playwright';
}

/**
 * Query options for fetching watch history
 */
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'watchedAt' | 'title' | 'channelName';
  orderDir?: 'asc' | 'desc';
  search?: string;
  dateFrom?: string; // ISO 8601
  dateTo?: string; // ISO 8601
  includeAds?: boolean;
  tagIds?: number[]; // Filter by tags
  tagLogic?: 'AND' | 'OR'; // How to combine multiple tags (default: OR)
}

/**
 * Result of a bulk insert operation
 */
export interface BulkInsertResult {
  inserted: number;
  duplicates: number;
  errors: Array<{ index: number; message: string }>;
}
