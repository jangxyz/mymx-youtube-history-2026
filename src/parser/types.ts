/**
 * Parsed watch history entry with normalized data
 */
export interface WatchHistoryEntry {
  videoId: string;
  title: string;
  url: string;
  channelName: string | null;
  channelUrl: string | null;
  thumbnailUrl: string;
  watchedAt: string; // ISO 8601
  isAd: boolean;
}

/**
 * Raw entry from Google Takeout JSON format
 */
export interface TakeoutJsonEntry {
  header: string;
  title: string;
  titleUrl?: string;
  subtitles?: Array<{
    name: string;
    url: string;
  }>;
  time: string;
  products: string[];
  details?: Array<{
    name: string;
  }>;
  description?: string;
  activityControls?: string[];
}

/**
 * Result of parsing a Takeout file
 */
export interface ParseResult {
  entries: WatchHistoryEntry[];
  errors: ParseError[];
  stats: {
    total: number;
    parsed: number;
    skipped: number;
    duplicates: number;
  };
}

/**
 * Error encountered during parsing
 */
export interface ParseError {
  index: number;
  message: string;
  rawEntry?: unknown;
}
