/**
 * Check if YouTube authentication is valid
 *
 * Exit codes:
 *   0 - Logged in and ready
 *   1 - Not logged in or profile missing
 *
 * Run: pnpm sync:check
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROFILE_DIR = path.join(__dirname, '../../.chrome-profile');
const YOUTUBE_HISTORY_URL = 'https://www.youtube.com/feed/history';

// Try headless first, fallback to headed if needed
const HEADLESS = process.env.HEADLESS !== 'false';

async function main() {
  // Check if profile exists
  if (!fs.existsSync(PROFILE_DIR)) {
    console.error('✗ Profile not found');
    console.error('  Run `pnpm sync:login` to set up authentication.');
    process.exit(1);
  }

  let browser;
  try {
    browser = await chromium.launchPersistentContext(PROFILE_DIR, {
      channel: 'chrome',
      headless: HEADLESS,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
      ignoreDefaultArgs: ['--enable-automation'],
    });

    const page = await browser.newPage();

    await page.goto(YOUTUBE_HISTORY_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for page to settle
    await page.waitForTimeout(2000);

    // Check if logged in
    const signInButton = await page.$('a[href*="accounts.google.com"], button:has-text("Sign in")');
    const isLoggedIn = !signInButton;

    if (isLoggedIn) {
      console.log('✓ Logged in to YouTube');
      process.exit(0);
    } else {
      console.error('✗ Not logged in');
      console.error('  Run `pnpm sync:login` to authenticate.');
      process.exit(1);
    }

  } catch (error) {
    console.error('✗ Check failed:', (error as Error).message);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main();
