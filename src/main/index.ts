import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseTakeoutFile } from '../parser/index.js';
import {
  initDatabase,
  WatchHistoryRepository,
  SyncMetaManager,
} from '../storage/index.js';
import type { QueryOptions } from '../storage/types.js';
import type Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database and repositories (initialized on app ready)
let db: Database.Database;
let repo: WatchHistoryRepository;
let syncMeta: SyncMetaManager;

// IPC handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('show-open-dialog', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select Google Takeout File',
    filters: [
      { name: 'Watch History', extensions: ['json', 'html'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('import-takeout', async (_event, filePath: string) => {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const filename = path.basename(filePath);
    const parseResult = parseTakeoutFile(content, filename);

    if (parseResult.errors.length > 0 && parseResult.entries.length === 0) {
      return {
        success: false,
        error: parseResult.errors[0].message,
      };
    }

    // Convert to insert entries with source
    const entries = parseResult.entries.map((e) => ({
      ...e,
      source: 'takeout' as const,
    }));

    // Bulk insert
    const insertResult = repo.bulkInsert(entries);

    // Update last import timestamp
    syncMeta.setLastTakeoutImport(new Date().toISOString());

    return {
      success: true,
      stats: {
        ...parseResult.stats,
        inserted: insertResult.inserted,
        duplicatesInDb: insertResult.duplicates,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle('get-history', (_event, options: QueryOptions) => {
  const entries = repo.query(options);
  const total = repo.count({
    search: options.search,
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    includeAds: options.includeAds,
  });

  return { entries, total };
});

ipcMain.handle('get-stats', () => {
  const total = repo.count();
  const nonAds = repo.count({ includeAds: false });
  const lastTakeoutImport = syncMeta.getLastTakeoutImport();
  const lastPlaywrightSync = syncMeta.getLastPlaywrightSync();
  const latestWatched = repo.getLatestWatchedAt();

  return {
    total,
    nonAds,
    ads: total - nonAds,
    lastTakeoutImport,
    lastPlaywrightSync,
    latestWatched,
  };
});

ipcMain.handle('delete-entry', (_event, id: number) => {
  return repo.delete(id);
});

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the renderer HTML file
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  // Initialize database
  db = initDatabase();
  repo = new WatchHistoryRepository(db);
  syncMeta = new SyncMetaManager(db);

  createWindow();

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked and no windows open
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS, apps typically stay active until explicit quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // Close database connection
  if (db) {
    db.close();
  }
});
