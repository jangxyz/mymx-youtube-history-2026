/**
 * Fetch YouTube watch history with infinite scroll
 *
 * Run: pnpm sync:fetch
 *
 * Options (env vars):
 *   MAX_VIDEOS=100     - Maximum videos to fetch (default: 100)
 *   STOP_AT=2025-01-01 - Stop when reaching this date
 *   HEADLESS=false     - Show browser window
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, Page } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROFILE_DIR = path.join(__dirname, '../../.chrome-profile');
const YOUTUBE_HISTORY_URL = 'https://www.youtube.com/feed/history';

// Configuration
const MAX_VIDEOS = parseInt(process.env.MAX_VIDEOS || '100', 10);
const STOP_AT = process.env.STOP_AT || null; // Date string like "2025-01-01"
const HEADLESS = process.env.HEADLESS !== 'false';

interface VideoEntry {
  videoId: string;
  title: string;
  channel: string;
  watchedAt: string;
  thumbnail: string;
  isShort: boolean;
}

/**
 * Extract video entries from the current page state
 */
async function extractVideos(page: Page): Promise<VideoEntry[]> {
  // Extract from regular video renderers
  const regularVideos = await page.$$eval('ytd-video-renderer', (elements) => {
    return elements.map((el) => {
      const linkEl = el.querySelector('a#video-title-link, a#video-title, a#thumbnail');
      const href = linkEl?.getAttribute('href') || '';

      let videoId = '';
      const watchMatch = href.match(/[?&]v=([^&]+)/);
      const shortsMatch = href.match(/\/shorts\/([^?&/]+)/);
      if (watchMatch) videoId = watchMatch[1];
      else if (shortsMatch) videoId = shortsMatch[1];

      const titleEl = el.querySelector('#video-title');
      const title = titleEl?.textContent?.trim() || '';

      const channelEl = el.querySelector('#channel-name a, ytd-channel-name a');
      const channel = channelEl?.textContent?.trim() || '';

      // Find section header for watchedAt
      let watchedAt = '';
      let parent = el.parentElement;
      while (parent) {
        const sectionHeader = parent.querySelector('ytd-item-section-header-renderer #title');
        if (sectionHeader) {
          watchedAt = sectionHeader.textContent?.trim() || '';
          break;
        }
        const prevSibling = parent.previousElementSibling;
        if (prevSibling) {
          const header = prevSibling.querySelector('#title');
          if (header) {
            watchedAt = header.textContent?.trim() || '';
            break;
          }
        }
        parent = parent.parentElement;
      }

      const isShort = href.includes('/shorts/');
      const thumbnail = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';

      return { videoId, title, channel, watchedAt, thumbnail, isShort };
    });
  });

  // Extract Shorts from ytm-shorts-lockup-view-model elements
  const shortsVideos = await page.$$eval('ytm-shorts-lockup-view-model', (elements) => {
    return elements.map((el) => {
      const linkEl = el.querySelector('a');
      const href = linkEl?.getAttribute('href') || '';

      let videoId = '';
      const shortsMatch = href.match(/\/shorts\/([^?&/]+)/);
      if (shortsMatch) videoId = shortsMatch[1];

      // Title from h3 or aria-label
      const titleEl = el.querySelector('h3, [aria-label]');
      let title = titleEl?.textContent?.trim() || '';
      if (!title) {
        title = linkEl?.getAttribute('aria-label') || '';
      }

      // Channel name - might be in a span or separate element
      const channelEl = el.querySelector('.ytd-channel-name, [class*="channel"]');
      const channel = channelEl?.textContent?.trim() || '';

      // Find section header for watchedAt by walking up
      let watchedAt = '';
      let parent = el.parentElement;
      while (parent && !watchedAt) {
        // Check for section header in this or parent containers
        const section = parent.closest('ytd-item-section-renderer');
        if (section) {
          const header = section.querySelector('ytd-item-section-header-renderer #title');
          if (header) {
            watchedAt = header.textContent?.trim() || '';
            break;
          }
        }
        parent = parent.parentElement;
      }

      const thumbnail = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';

      return { videoId, title, channel, watchedAt, thumbnail, isShort: true };
    });
  });

  return [...regularVideos, ...shortsVideos];
}

/**
 * Scroll down and wait for new content to load
 */
async function scrollAndWait(page: Page): Promise<number> {
  // Count all video elements (regular + shorts)
  const countVideos = async () => {
    return page.evaluate(() => {
      return document.querySelectorAll('ytd-video-renderer, ytm-shorts-lockup-view-model').length;
    });
  };

  const beforeCount = await countVideos();

  // Scroll multiple times to trigger loading
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });
    await page.waitForTimeout(300);
  }

  // Scroll to bottom
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });

  // Wait for content to load
  await page.waitForTimeout(2500);

  const afterCount = await countVideos();
  return afterCount - beforeCount;
}

/**
 * Check if we should stop fetching based on date
 */
function shouldStopAtDate(watchedAt: string, stopAt: string): boolean {
  // Parse relative dates like "Today", "Yesterday", "Monday", "Jan 20"
  // For now, just do simple string comparison for full dates like "Dec 30, 2025"
  if (watchedAt.includes(',')) {
    // Has year - compare dates
    const watchedDate = new Date(watchedAt);
    const stopDate = new Date(stopAt);
    return watchedDate < stopDate;
  }
  return false;
}

async function main() {
  if (!fs.existsSync(PROFILE_DIR)) {
    console.error('Profile not found. Run `pnpm sync:login` first.');
    process.exit(1);
  }

  console.log('Fetching YouTube watch history...');
  console.log(`  Max videos: ${MAX_VIDEOS}`);
  if (STOP_AT) console.log(`  Stop at: ${STOP_AT}`);
  console.log('');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: HEADLESS,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  try {
    const page = await context.newPage();
    await page.goto(YOUTUBE_HISTORY_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Check if logged in
    const signInButton = await page.$('button:has-text("Sign in")');
    if (signInButton) {
      console.error('Not logged in. Run `pnpm sync:login` first.');
      process.exit(1);
    }

    const allVideos: VideoEntry[] = [];
    const seenIds = new Set<string>();
    let noNewContentCount = 0;
    let shouldStop = false;

    console.log('Scrolling and extracting...');

    while (allVideos.length < MAX_VIDEOS && noNewContentCount < 5 && !shouldStop) {
      // Extract current videos
      const videos = await extractVideos(page);

      // Add new videos
      let newCount = 0;
      for (const video of videos) {
        if (video.videoId && !seenIds.has(video.videoId)) {
          seenIds.add(video.videoId);
          allVideos.push(video);
          newCount++;

          // Check stop condition
          if (STOP_AT && shouldStopAtDate(video.watchedAt, STOP_AT)) {
            console.log(`  Reached stop date: ${video.watchedAt}`);
            shouldStop = true;
            break;
          }

          if (allVideos.length >= MAX_VIDEOS) break;
        }
      }

      process.stdout.write(`  Found ${allVideos.length} videos...\r`);

      if (allVideos.length >= MAX_VIDEOS || shouldStop) break;

      // Scroll for more
      const newFromScroll = await scrollAndWait(page);
      if (newFromScroll === 0) {
        noNewContentCount++;
      } else {
        noNewContentCount = 0;
      }
    }

    console.log(`\n\nFetched ${allVideos.length} videos.`);

    // Output as JSON
    const outputPath = path.join(__dirname, '../../history-output.json');
    fs.writeFileSync(outputPath, JSON.stringify(allVideos, null, 2));
    console.log(`Saved to: ${outputPath}`);

    // Show sample
    console.log('\nFirst 3 entries:');
    allVideos.slice(0, 3).forEach((v, i) => {
      console.log(`  [${i + 1}] ${v.title.substring(0, 50)}...`);
      console.log(`      ${v.channel} · ${v.watchedAt}`);
    });

  } finally {
    await context.close();
  }
}

main().catch(console.error);
