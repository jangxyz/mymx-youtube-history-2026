/**
 * Login script: Set up YouTube authentication
 *
 * Use this to:
 * - First-time setup (sign in to YouTube)
 * - Re-authenticate when session expires
 * - Switch accounts
 *
 * Run: pnpm sync:login
 */
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Source: Chrome profile to copy from (e.g., "Profile 3" = mymx-bot)
const CHROME_PROFILE = process.env.CHROME_PROFILE || 'Profile 3';
const CHROME_DIR = path.join(
  process.env.HOME || '',
  'Library/Application Support/Google/Chrome'
);

// Destination: Project directory for Playwright profile
const PROFILE_DIR = path.join(__dirname, '../../.chrome-profile');

const YOUTUBE_URL = 'https://www.youtube.com';
const YOUTUBE_HISTORY_URL = 'https://www.youtube.com/feed/history';

function copyProfile(force = false) {
  const sourceProfile = path.join(CHROME_DIR, CHROME_PROFILE);
  const destProfile = path.join(PROFILE_DIR, 'Default');

  if (!fs.existsSync(sourceProfile)) {
    console.error(`Source profile not found: ${sourceProfile}`);
    console.error(`Create a Chrome profile first and set CHROME_PROFILE env var.`);
    process.exit(1);
  }

  if (force && fs.existsSync(PROFILE_DIR)) {
    console.log('Removing old profile...');
    fs.rmSync(PROFILE_DIR, { recursive: true });
  }

  if (!fs.existsSync(destProfile)) {
    console.log(`Copying Chrome profile "${CHROME_PROFILE}"...`);
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
    execSync(`cp -r "${sourceProfile}" "${destProfile}"`, { stdio: 'inherit' });
    console.log('Profile copied.\n');
  }
}

async function checkLoginStatus(page: Awaited<ReturnType<typeof chromium.launchPersistentContext>>['pages'] extends () => infer R ? R extends Array<infer P> ? P : never : never): Promise<boolean> {
  try {
    await page.goto(YOUTUBE_HISTORY_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(2000);

    const signInButton = await page.$('button:has-text("Sign in")');
    return !signInButton;
  } catch {
    return false;
  }
}

async function main() {
  const forceRefresh = process.argv.includes('--fresh') || process.argv.includes('-f');

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          YouTube History - Login Setup                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  if (forceRefresh) {
    console.log('Fresh login requested (--fresh flag).\n');
  }

  copyProfile(forceRefresh);

  console.log('Launching browser...');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const page = await context.newPage();

  // Check if already logged in
  console.log('Checking login status...');
  const alreadyLoggedIn = await checkLoginStatus(page);

  if (alreadyLoggedIn) {
    console.log('\n✓ Already logged in to YouTube!');
    console.log('');
    console.log('Your session is ready. You can close this browser.');
    console.log('Run `pnpm sync:login --fresh` to sign in with a different account.');
    console.log('');
    console.log('Press Ctrl+C to close.');
    await new Promise(() => {});
  }

  // Not logged in - guide user through sign-in
  console.log('\n⚠ Not logged in to YouTube.');
  console.log('');
  console.log('Please sign in:');
  console.log('  1. Click "Sign in" in the browser');
  console.log('  2. Log into your Google account');
  console.log('  3. Wait for this script to confirm success');
  console.log('');

  await page.goto(YOUTUBE_URL, { waitUntil: 'domcontentloaded' });

  // Poll for login success
  console.log('Waiting for sign in...');
  let loggedIn = false;
  for (let i = 0; i < 120; i++) { // 10 minutes max
    await page.waitForTimeout(5000);

    loggedIn = await checkLoginStatus(page);
    if (loggedIn) {
      break;
    }
    process.stdout.write('.');
  }

  if (loggedIn) {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  ✓ SUCCESS! You are now logged in to YouTube.             ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Your session has been saved. You can now run:');
    console.log('  pnpm sync:test    - to test fetching your history');
    console.log('');
    console.log('Press Ctrl+C to close the browser.');
    await new Promise(() => {});
  } else {
    console.log('\n');
    console.log('⚠ Login timed out. Please try again.');
  }

  await context.close();
}

main().catch(console.error);
