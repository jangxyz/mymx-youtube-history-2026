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

      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'test-screenshot.png' });
      console.log('Screenshot saved to test-screenshot.png');

      const videoEntries = await page.$$('ytd-video-renderer, ytd-reel-shelf-renderer');
      console.log(`Found ${videoEntries.length} video entries on page`);

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
