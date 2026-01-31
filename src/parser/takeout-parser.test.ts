import { describe, it, expect } from 'vitest';
import {
  extractVideoId,
  getThumbnailUrl,
  cleanTitle,
  isAdEntry,
  parseEntry,
  parseTakeoutJson,
  parseTakeoutFile,
} from './takeout-parser.js';
import type { TakeoutJsonEntry } from './types.js';

describe('extractVideoId', () => {
  it('extracts ID from standard watch URL', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=zrcCS9oHjtI')).toBe(
      'zrcCS9oHjtI'
    );
  });

  it('extracts ID from watch URL with additional params', () => {
    expect(
      extractVideoId('https://www.youtube.com/watch?v=abc123DEF_-&t=120')
    ).toBe('abc123DEF_-');
  });

  it('extracts ID from short URL', () => {
    expect(extractVideoId('https://youtu.be/zrcCS9oHjtI')).toBe('zrcCS9oHjtI');
  });

  it('extracts ID from embed URL', () => {
    expect(extractVideoId('https://www.youtube.com/embed/zrcCS9oHjtI')).toBe(
      'zrcCS9oHjtI'
    );
  });

  it('extracts ID from shorts URL', () => {
    expect(extractVideoId('https://www.youtube.com/shorts/zrcCS9oHjtI')).toBe(
      'zrcCS9oHjtI'
    );
  });

  it('extracts ID from live URL', () => {
    expect(extractVideoId('https://www.youtube.com/live/zrcCS9oHjtI')).toBe(
      'zrcCS9oHjtI'
    );
  });

  it('returns null for invalid URL', () => {
    expect(extractVideoId('https://example.com/video')).toBeNull();
  });

  it('returns null for URL with invalid video ID length', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=short')).toBeNull();
  });
});

describe('getThumbnailUrl', () => {
  it('generates correct thumbnail URL', () => {
    expect(getThumbnailUrl('zrcCS9oHjtI')).toBe(
      'https://i.ytimg.com/vi/zrcCS9oHjtI/hqdefault.jpg'
    );
  });
});

describe('cleanTitle', () => {
  it('removes "Watched " prefix', () => {
    expect(cleanTitle('Watched Claude Code on desktop')).toBe(
      'Claude Code on desktop'
    );
  });

  it('handles title without prefix', () => {
    expect(cleanTitle('Some video title')).toBe('Some video title');
  });

  it('handles Korean titles', () => {
    expect(cleanTitle('Watched 한글 제목 테스트')).toBe('한글 제목 테스트');
  });
});

describe('isAdEntry', () => {
  it('detects ad entries', () => {
    const adEntry: TakeoutJsonEntry = {
      header: 'YouTube',
      title: 'Watched Some Ad',
      titleUrl: 'https://www.youtube.com/watch?v=abc123DEF_-',
      time: '2026-01-31T01:00:00.000Z',
      products: ['YouTube'],
      details: [{ name: 'From Google Ads' }],
    };
    expect(isAdEntry(adEntry)).toBe(true);
  });

  it('returns false for non-ad entries', () => {
    const regularEntry: TakeoutJsonEntry = {
      header: 'YouTube',
      title: 'Watched Regular Video',
      titleUrl: 'https://www.youtube.com/watch?v=abc123DEF_-',
      time: '2026-01-31T01:00:00.000Z',
      products: ['YouTube'],
    };
    expect(isAdEntry(regularEntry)).toBe(false);
  });
});

describe('parseEntry', () => {
  it('parses a complete entry', () => {
    const rawEntry: TakeoutJsonEntry = {
      header: 'YouTube',
      title: 'Watched Claude Code on desktop',
      titleUrl: 'https://www.youtube.com/watch?v=zrcCS9oHjtI',
      subtitles: [
        {
          name: 'Anthropic',
          url: 'https://www.youtube.com/channel/UCrDwWp7EBBv4NwvScIpBDOA',
        },
      ],
      time: '2026-01-31T02:04:56.748Z',
      products: ['YouTube'],
    };

    const result = parseEntry(rawEntry, 0);
    expect(result.error).toBeNull();
    expect(result.entry).toEqual({
      videoId: 'zrcCS9oHjtI',
      title: 'Claude Code on desktop',
      url: 'https://www.youtube.com/watch?v=zrcCS9oHjtI',
      channelName: 'Anthropic',
      channelUrl: 'https://www.youtube.com/channel/UCrDwWp7EBBv4NwvScIpBDOA',
      thumbnailUrl: 'https://i.ytimg.com/vi/zrcCS9oHjtI/hqdefault.jpg',
      watchedAt: '2026-01-31T02:04:56.748Z',
      isAd: false,
    });
  });

  it('parses entry without channel info', () => {
    const rawEntry: TakeoutJsonEntry = {
      header: 'YouTube',
      title: 'Watched Some Video',
      titleUrl: 'https://www.youtube.com/watch?v=abc123DEF_-',
      time: '2026-01-31T01:00:00.000Z',
      products: ['YouTube'],
    };

    const result = parseEntry(rawEntry, 0);
    expect(result.error).toBeNull();
    expect(result.entry?.channelName).toBeNull();
    expect(result.entry?.channelUrl).toBeNull();
  });

  it('marks ad entries correctly', () => {
    const adEntry: TakeoutJsonEntry = {
      header: 'YouTube',
      title: 'Watched Some Ad',
      titleUrl: 'https://www.youtube.com/watch?v=abc123DEF_-',
      time: '2026-01-31T01:00:00.000Z',
      products: ['YouTube'],
      details: [{ name: 'From Google Ads' }],
    };

    const result = parseEntry(adEntry, 0);
    expect(result.entry?.isAd).toBe(true);
  });

  it('returns error for entry without URL', () => {
    const rawEntry: TakeoutJsonEntry = {
      header: 'YouTube',
      title: 'Watched a video that has been removed',
      time: '2026-01-31T01:00:00.000Z',
      products: ['YouTube'],
    };

    const result = parseEntry(rawEntry, 5);
    expect(result.entry).toBeNull();
    expect(result.error).toEqual({
      index: 5,
      message: 'Missing titleUrl',
      rawEntry,
    });
  });

});

describe('parseTakeoutJson', () => {
  it('parses valid JSON array', () => {
    const json = JSON.stringify([
      {
        header: 'YouTube',
        title: 'Watched Video 1',
        titleUrl: 'https://www.youtube.com/watch?v=abc123DEF_-',
        time: '2026-01-31T01:00:00.000Z',
        products: ['YouTube'],
      },
      {
        header: 'YouTube',
        title: 'Watched Video 2',
        titleUrl: 'https://www.youtube.com/watch?v=xyz789GHI_-',
        time: '2026-01-31T02:00:00.000Z',
        products: ['YouTube'],
      },
    ]);

    const result = parseTakeoutJson(json);
    expect(result.entries).toHaveLength(2);
    expect(result.stats).toEqual({
      total: 2,
      parsed: 2,
      skipped: 0,
      duplicates: 0,
    });
  });

  it('handles invalid JSON', () => {
    const result = parseTakeoutJson('not valid json');
    expect(result.entries).toHaveLength(0);
    expect(result.errors[0].message).toContain('Invalid JSON');
  });

  it('handles non-array JSON', () => {
    const result = parseTakeoutJson('{"key": "value"}');
    expect(result.entries).toHaveLength(0);
    expect(result.errors[0].message).toBe('Expected JSON array at root');
  });

  it('deduplicates entries with same videoId and timestamp', () => {
    const json = JSON.stringify([
      {
        header: 'YouTube',
        title: 'Watched Video',
        titleUrl: 'https://www.youtube.com/watch?v=abc123DEF_-',
        time: '2026-01-31T01:00:00.000Z',
        products: ['YouTube'],
      },
      {
        header: 'YouTube',
        title: 'Watched Video',
        titleUrl: 'https://www.youtube.com/watch?v=abc123DEF_-',
        time: '2026-01-31T01:00:00.000Z',
        products: ['YouTube'],
      },
    ]);

    const result = parseTakeoutJson(json);
    expect(result.entries).toHaveLength(1);
    expect(result.stats.duplicates).toBe(1);
  });

  it('allows same video with different timestamps', () => {
    const json = JSON.stringify([
      {
        header: 'YouTube',
        title: 'Watched Video',
        titleUrl: 'https://www.youtube.com/watch?v=abc123DEF_-',
        time: '2026-01-31T01:00:00.000Z',
        products: ['YouTube'],
      },
      {
        header: 'YouTube',
        title: 'Watched Video',
        titleUrl: 'https://www.youtube.com/watch?v=abc123DEF_-',
        time: '2026-01-31T02:00:00.000Z',
        products: ['YouTube'],
      },
    ]);

    const result = parseTakeoutJson(json);
    expect(result.entries).toHaveLength(2);
    expect(result.stats.duplicates).toBe(0);
  });

  it('skips entries without URL and tracks errors', () => {
    const json = JSON.stringify([
      {
        header: 'YouTube',
        title: 'Watched Valid Video',
        titleUrl: 'https://www.youtube.com/watch?v=abc123DEF_-',
        time: '2026-01-31T01:00:00.000Z',
        products: ['YouTube'],
      },
      {
        header: 'YouTube',
        title: 'Watched removed video',
        time: '2026-01-31T02:00:00.000Z',
        products: ['YouTube'],
      },
    ]);

    const result = parseTakeoutJson(json);
    expect(result.entries).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.stats.skipped).toBe(1);
  });
});

describe('parseTakeoutFile', () => {
  it('detects JSON by filename', () => {
    const json = JSON.stringify([
      {
        header: 'YouTube',
        title: 'Watched Video',
        titleUrl: 'https://www.youtube.com/watch?v=abc123DEF_-',
        time: '2026-01-31T01:00:00.000Z',
        products: ['YouTube'],
      },
    ]);

    const result = parseTakeoutFile(json, 'watch-history.json');
    expect(result.entries).toHaveLength(1);
  });

  it('returns error for HTML (not yet implemented)', () => {
    const result = parseTakeoutFile('<html></html>', 'watch-history.html');
    expect(result.errors[0].message).toBe('HTML parsing not yet implemented');
  });

  it('auto-detects JSON by content', () => {
    const json = JSON.stringify([
      {
        header: 'YouTube',
        title: 'Watched Video',
        titleUrl: 'https://www.youtube.com/watch?v=abc123DEF_-',
        time: '2026-01-31T01:00:00.000Z',
        products: ['YouTube'],
      },
    ]);

    const result = parseTakeoutFile(json, 'unknown-file');
    expect(result.entries).toHaveLength(1);
  });

  it('returns error for unknown format', () => {
    const result = parseTakeoutFile('random content', 'file.txt');
    expect(result.errors[0].message).toContain('Unknown file format');
  });
});
