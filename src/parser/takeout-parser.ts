import type {
  WatchHistoryEntry,
  TakeoutJsonEntry,
  ParseResult,
  ParseError,
} from './types.js';

/**
 * Extract video ID from various YouTube URL formats
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    // Standard watch URL: youtube.com/watch?v=VIDEO_ID
    /(?:youtube\.com\/watch\?v=|youtube\.com\/watch\?.+&v=)([a-zA-Z0-9_-]{11})/,
    // Short URL: youtu.be/VIDEO_ID
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    // Embed URL: youtube.com/embed/VIDEO_ID
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    // Shorts URL: youtube.com/shorts/VIDEO_ID
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    // Live URL: youtube.com/live/VIDEO_ID
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Generate thumbnail URL from video ID
 */
export function getThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Clean video title by removing "Watched " prefix
 */
export function cleanTitle(rawTitle: string): string {
  const prefix = 'Watched ';
  if (rawTitle.startsWith(prefix)) {
    return rawTitle.slice(prefix.length);
  }
  return rawTitle;
}

/**
 * Check if entry is an ad
 */
export function isAdEntry(entry: TakeoutJsonEntry): boolean {
  return entry.details?.some((d) => d.name === 'From Google Ads') ?? false;
}

/**
 * Parse a single Takeout JSON entry into a WatchHistoryEntry
 */
export function parseEntry(
  entry: TakeoutJsonEntry,
  index: number
): { entry: WatchHistoryEntry | null; error: ParseError | null } {
  // Skip entries without URL (removed videos, etc.)
  if (!entry.titleUrl) {
    return {
      entry: null,
      error: {
        index,
        message: 'Missing titleUrl',
        rawEntry: entry,
      },
    };
  }

  const videoId = extractVideoId(entry.titleUrl);
  if (!videoId) {
    return {
      entry: null,
      error: {
        index,
        message: `Could not extract video ID from URL: ${entry.titleUrl}`,
        rawEntry: entry,
      },
    };
  }

  const subtitle = entry.subtitles?.[0];

  return {
    entry: {
      videoId,
      title: cleanTitle(entry.title),
      url: entry.titleUrl,
      channelName: subtitle?.name ?? null,
      channelUrl: subtitle?.url ?? null,
      thumbnailUrl: getThumbnailUrl(videoId),
      watchedAt: entry.time,
      isAd: isAdEntry(entry),
    },
    error: null,
  };
}

/**
 * Parse Google Takeout JSON watch history
 */
export function parseTakeoutJson(jsonContent: string): ParseResult {
  const entries: WatchHistoryEntry[] = [];
  const errors: ParseError[] = [];
  const seenIds = new Set<string>();
  let duplicates = 0;

  let rawEntries: TakeoutJsonEntry[];
  try {
    rawEntries = JSON.parse(jsonContent) as TakeoutJsonEntry[];
  } catch (e) {
    return {
      entries: [],
      errors: [
        {
          index: -1,
          message: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
        },
      ],
      stats: { total: 0, parsed: 0, skipped: 0, duplicates: 0 },
    };
  }

  if (!Array.isArray(rawEntries)) {
    return {
      entries: [],
      errors: [{ index: -1, message: 'Expected JSON array at root' }],
      stats: { total: 0, parsed: 0, skipped: 0, duplicates: 0 },
    };
  }

  for (let i = 0; i < rawEntries.length; i++) {
    const rawEntry = rawEntries[i];
    const result = parseEntry(rawEntry, i);

    if (result.error) {
      errors.push(result.error);
      continue;
    }

    if (result.entry) {
      // Create unique key: videoId + timestamp for deduplication
      const uniqueKey = `${result.entry.videoId}:${result.entry.watchedAt}`;
      if (seenIds.has(uniqueKey)) {
        duplicates++;
        continue;
      }
      seenIds.add(uniqueKey);
      entries.push(result.entry);
    }
  }

  return {
    entries,
    errors,
    stats: {
      total: rawEntries.length,
      parsed: entries.length,
      skipped: errors.length,
      duplicates,
    },
  };
}

/**
 * Parse Google Takeout HTML watch history
 * Note: HTML format support is a stub - implement when sample available
 */
export function parseTakeoutHtml(_htmlContent: string): ParseResult {
  // TODO: Implement HTML parsing when sample file is available
  // HTML format uses different structure with div.content-cell elements
  return {
    entries: [],
    errors: [{ index: -1, message: 'HTML parsing not yet implemented' }],
    stats: { total: 0, parsed: 0, skipped: 0, duplicates: 0 },
  };
}

/**
 * Parse a Takeout file (auto-detect format)
 */
export function parseTakeoutFile(
  content: string,
  filename: string
): ParseResult {
  const lowerFilename = filename.toLowerCase();

  if (lowerFilename.endsWith('.json')) {
    return parseTakeoutJson(content);
  }

  if (lowerFilename.endsWith('.html') || lowerFilename.endsWith('.htm')) {
    return parseTakeoutHtml(content);
  }

  // Try to auto-detect by content
  const trimmed = content.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return parseTakeoutJson(content);
  }

  if (trimmed.startsWith('<!') || trimmed.startsWith('<html')) {
    return parseTakeoutHtml(content);
  }

  return {
    entries: [],
    errors: [{ index: -1, message: `Unknown file format: ${filename}` }],
    stats: { total: 0, parsed: 0, skipped: 0, duplicates: 0 },
  };
}
