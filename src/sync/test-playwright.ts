/**
 * Test script: Fetch YouTube history using saved profile
 *
 * Requires: Run `pnpm sync:login` first to set up authentication
 *
 * Run: pnpm sync:test
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Profile directory (created by sync:login)
const PROFILE_DIR = path.join(__dirname, '../../.chrome-profile');

// How long to keep browser open (default: 0 = wait indefinitely)
const TIMEOUT_SECONDS = parseFloat(process.env.TIMEOUT || '0');

const YOUTUBE_HISTORY_URL = 'https://www.youtube.com/feed/history';

async function main() {
  // Check if profile exists
  if (!fs.existsSync(PROFILE_DIR)) {
    console.error('Profile not found. Run `pnpm sync:login` first to set up authentication.');
    process.exit(1);
  }

  console.log(`Using profile: ${PROFILE_DIR}`);
  console.log('Launching Chrome...');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  console.log('Chrome launched, creating page...');
  const page = await context.newPage();

  console.log(`Navigating to ${YOUTUBE_HISTORY_URL}...`);

  try {
    const response = await page.goto(YOUTUBE_HISTORY_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    console.log(`Response status: ${response?.status()}`);
    console.log(`Final URL: ${page.url()}`);

    const title = await page.title();
    console.log(`Page title: ${title}`);

    // Check if logged in
    const signInButton = await page.$('a[href*="accounts.google.com"], button:has-text("Sign in")');
    const isLoggedIn = !signInButton;

    if (isLoggedIn) {
      console.log('\n✓ You are logged in!');

      // Wait for content to load and scroll down to get more videos
      await page.waitForTimeout(2000);
      await page.evaluate(() => window.scrollBy(0, 1000));
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'test-screenshot.png' });
      console.log('Screenshot saved to test-screenshot.png');

      // Extract video entries with section context (for watchedAt)
      const videos = await page.$$eval('ytd-video-renderer', (elements) => {
        return elements.slice(0, 10).map((el) => {
          // Video link contains the videoId
          const linkEl = el.querySelector('a#video-title-link, a#video-title, a#thumbnail');
          const href = linkEl?.getAttribute('href') || '';

          // Handle different URL formats:
          // /watch?v=VIDEO_ID or /shorts/VIDEO_ID
          let videoId: string | null = null;
          const watchMatch = href.match(/[?&]v=([^&]+)/);
          const shortsMatch = href.match(/\/shorts\/([^?&/]+)/);
          if (watchMatch) videoId = watchMatch[1];
          else if (shortsMatch) videoId = shortsMatch[1];

          // Title
          const titleEl = el.querySelector('#video-title');
          const title = titleEl?.textContent?.trim() || '';

          // Channel name
          const channelEl = el.querySelector('#channel-name a, #text.ytd-channel-name a, ytd-channel-name a');
          const channel = channelEl?.textContent?.trim() || '';

          // Thumbnail - can be constructed from videoId if not found in DOM
          const thumbEl = el.querySelector('ytd-thumbnail img, #thumbnail img, img');
          let thumbnail = thumbEl?.getAttribute('src') || '';
          if (!thumbnail) {
            thumbnail = thumbEl?.getAttribute('data-src') || '';
          }

          // Metadata (contains view count and time ago)
          const metaEl = el.querySelector('#metadata-line');
          const metadata = metaEl?.textContent?.trim() || '';

          // Find section header (Today, Yesterday, etc.) by walking up the DOM
          let watchedAt = '';
          let parent = el.parentElement;
          while (parent) {
            // Look for section header in parent or previous siblings
            const sectionHeader = parent.querySelector('ytd-item-section-header-renderer #title');
            if (sectionHeader) {
              watchedAt = sectionHeader.textContent?.trim() || '';
              break;
            }
            // Check previous sibling for section header
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

          // Video type
          const isShort = href.includes('/shorts/');

          return { videoId, title, channel, thumbnail, metadata, href, watchedAt, isShort };
        });
      });

      console.log(`\nFound ${videos.length} video entries:`);
      videos.forEach((v, i) => {
        // Construct thumbnail URL from videoId if not found
        const thumbUrl = v.thumbnail || (v.videoId ? `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg` : null);

        console.log(`\n[${i + 1}] ${v.title}`);
        console.log(`    ID: ${v.videoId}${v.isShort ? ' (Short)' : ''}`);
        console.log(`    Channel: ${v.channel}`);
        console.log(`    Watched: ${v.watchedAt || '(unknown)'}`);
        console.log(`    Thumbnail: ${thumbUrl ? thumbUrl.substring(0, 60) + '...' : '(none)'}`);
      });

    } else {
      console.log('\n⚠ Not logged in.');
      console.log('Run `pnpm sync:login` to set up authentication.');
    }

    if (TIMEOUT_SECONDS > 0) {
      console.log(`\nKeeping browser open for ${TIMEOUT_SECONDS} seconds... (set TIMEOUT=0 to wait indefinitely)`);
      await page.waitForTimeout(TIMEOUT_SECONDS * 1000);
    } else {
      console.log('\nBrowser open indefinitely. Press Ctrl+C to close.');
      console.log('(Set TIMEOUT=30 to auto-close after 30 seconds)');
      await new Promise(() => {}); // Wait forever
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await context.close();
    console.log('Done.');
  }
}

main();
