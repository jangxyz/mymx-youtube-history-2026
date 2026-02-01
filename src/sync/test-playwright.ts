/**
 * Test script: Playwright with persistent login session
 *
 * Run with: pnpm sync:test
 *
 * First run: Log into YouTube manually, then close the browser.
 * Subsequent runs: Should stay logged in.
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const YOUTUBE_HISTORY_URL = 'https://www.youtube.com/feed/history';

// Persistent browser profile directory (stores cookies, localStorage, etc.)
const USER_DATA_DIR = path.join(__dirname, '../../.playwright-profile');

async function main() {
  console.log('Launching browser with persistent profile...');
  console.log(`Profile directory: ${USER_DATA_DIR}`);

  // launchPersistentContext keeps login state between sessions
  // Use real Chrome instead of Chromium to avoid Google's bot detection
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'chrome', // Use installed Chrome, not Playwright's Chromium
    headless: false,
    viewport: { width: 1280, height: 800 },
  });

  const page = context.pages()[0] || await context.newPage();

  console.log(`Navigating to ${YOUTUBE_HISTORY_URL}...`);

  try {
    const response = await page.goto(YOUTUBE_HISTORY_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    console.log(`Response status: ${response?.status()}`);
    console.log(`Final URL: ${page.url()}`);

    // Check what we got
    const title = await page.title();
    console.log(`Page title: ${title}`);

    // Check if logged in by looking for sign-in button
    const signInButton = await page.$('a[href*="accounts.google.com"], button:has-text("Sign in")');
    const isLoggedIn = !signInButton;

    if (isLoggedIn) {
      console.log('\n✓ You are logged in!');
      console.log('Looking for watch history entries...');

      // Wait for content to load
      await page.waitForTimeout(2000);

      // Take a screenshot
      await page.screenshot({ path: 'test-screenshot.png' });
      console.log('Screenshot saved to test-screenshot.png');

      // Try to find video entries
      const videoEntries = await page.$$('ytd-video-renderer, ytd-reel-shelf-renderer');
      console.log(`Found ${videoEntries.length} video entries on page`);

    } else {
      console.log('\n⚠ Not logged in yet.');
      console.log('Please sign in to YouTube in the browser window.');
      console.log('After signing in, close the browser and run this script again.');
      console.log('\nWaiting for you to sign in...');
    }

    // Keep browser open for manual interaction
    console.log('\nBrowser will stay open for 60 seconds...');
    console.log('Press Ctrl+C to close earlier.');
    await page.waitForTimeout(60000);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await context.close();
    console.log('Browser closed. Session saved to profile directory.');
  }
}

main();
