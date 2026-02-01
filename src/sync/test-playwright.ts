/**
 * Test script: Persistent Chrome profile for YouTube history
 *
 * First run: Sign in to YouTube manually
 * Future runs: Already logged in (session saved)
 *
 * Run: pnpm sync:test
 */
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

// Source: Chrome profile to copy from (e.g., "Profile 3" = mymx-bot)
const CHROME_PROFILE = process.env.CHROME_PROFILE || 'Profile 3';
const CHROME_DIR = path.join(
  process.env.HOME || '',
  'Library/Application Support/Google/Chrome'
);

// Destination: Separate directory for Playwright to use
const PROFILE_DIR = path.join(
  process.env.HOME || '',
  '.mymx-chrome-profile'
);

// How long to keep browser open (default: 0 = wait indefinitely)
const TIMEOUT_SECONDS = parseFloat(process.env.TIMEOUT || '0');

const YOUTUBE_HISTORY_URL = 'https://www.youtube.com/feed/history';

/**
 * Copy the Chrome profile to the destination directory if it doesn't exist.
 */
function copyProfileIfNeeded() {
  const sourceProfile = path.join(CHROME_DIR, CHROME_PROFILE);
  const destProfile = path.join(PROFILE_DIR, 'Default');

  if (!fs.existsSync(sourceProfile)) {
    console.error(`Source profile not found: ${sourceProfile}`);
    console.error(`Create a Chrome profile first and set CHROME_PROFILE env var.`);
    process.exit(1);
  }

  if (!fs.existsSync(destProfile)) {
    console.log(`Copying Chrome profile "${CHROME_PROFILE}" to ${PROFILE_DIR}...`);
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
    execSync(`cp -r "${sourceProfile}" "${destProfile}"`, { stdio: 'inherit' });
    console.log('Profile copied.\n');
  } else {
    console.log(`Using existing profile copy. Delete ~/.mymx-chrome-profile to refresh.\n`);
  }
}

async function main() {
  console.log(`Source Chrome profile: ${CHROME_PROFILE}`);
  console.log('');

  copyProfileIfNeeded();

  console.log('Launching Chrome...');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [
      '--disable-blink-features=AutomationControlled',
    ],
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
      console.log('Please sign in to YouTube in the browser window.');
      console.log('Your session will be saved for future runs.\n');

      // Wait for user to sign in (check every 5 seconds)
      console.log('Waiting for sign in...');
      for (let i = 0; i < 60; i++) { // 5 minutes max
        await page.waitForTimeout(5000);

        // Check if URL changed to history page with content
        const currentUrl = page.url();
        const stillHasSignIn = await page.$('button:has-text("Sign in")');

        if (!stillHasSignIn || currentUrl.includes('/feed/history')) {
          // Reload to check if logged in
          await page.goto(YOUTUBE_HISTORY_URL, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2000);

          const signInAfter = await page.$('button:has-text("Sign in")');
          if (!signInAfter) {
            console.log('\n✓ Sign in successful! Session saved.');
            await page.screenshot({ path: 'test-screenshot.png' });
            console.log('Screenshot saved to test-screenshot.png');
            break;
          }
        }
        process.stdout.write('.');
      }
    }

    if (TIMEOUT_SECONDS > 0) {
      console.log(`\nKeeping browser open for ${TIMEOUT_SECONDS} seconds... (set TIMEOUT=0 to wait indefinitely)`);
      await page.waitForTimeout(TIMEOUT_SECONDS * 1000);
    } else {
      console.log('\nBrowser open indefinitely. Press Ctrl+C to close.');
      console.log('(Set TIMEOUT=30 to auto-close after 30 seconds)');
      await new Promise(() => { }); // Wait forever
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await context.close();
    console.log('Done.');
  }
}

main();
