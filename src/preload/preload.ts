import { contextBridge, ipcRenderer } from 'electron';

// Types for IPC communication
interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'watchedAt' | 'title' | 'channelName';
  orderDir?: 'asc' | 'desc';
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  includeAds?: boolean;
}

interface WatchHistoryEntry {
  id: number;
  videoId: string;
  title: string;
  url: string;
  channelName: string | null;
  channelUrl: string | null;
  thumbnailUrl: string;
  watchedAt: string;
  isAd: boolean;
  source: 'takeout' | 'playwright';
  createdAt: string;
  updatedAt: string;
}

interface ImportResult {
  success: boolean;
  error?: string;
  stats?: {
    total: number;
    parsed: number;
    skipped: number;
    duplicates: number;
    inserted: number;
    duplicatesInDb: number;
  };
}

interface HistoryResult {
  entries: WatchHistoryEntry[];
  total: number;
}

interface Stats {
  total: number;
  nonAds: number;
  ads: number;
  lastTakeoutImport: string | null;
  lastPlaywrightSync: string | null;
  latestWatched: string | null;
}

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version') as Promise<string>,

  // File dialog
  showOpenDialog: () =>
    ipcRenderer.invoke('show-open-dialog') as Promise<string | null>,

  // Import
  importTakeout: (filePath: string) =>
    ipcRenderer.invoke('import-takeout', filePath) as Promise<ImportResult>,

  // History queries
  getHistory: (options: QueryOptions) =>
    ipcRenderer.invoke('get-history', options) as Promise<HistoryResult>,

  // Stats
  getStats: () => ipcRenderer.invoke('get-stats') as Promise<Stats>,

  // Delete
  deleteEntry: (id: number) =>
    ipcRenderer.invoke('delete-entry', id) as Promise<boolean>,
});

// Type declaration for the exposed API
declare global {
  interface Window {
    electronAPI: {
      getAppVersion: () => Promise<string>;
      showOpenDialog: () => Promise<string | null>;
      importTakeout: (filePath: string) => Promise<ImportResult>;
      getHistory: (options: QueryOptions) => Promise<HistoryResult>;
      getStats: () => Promise<Stats>;
      deleteEntry: (id: number) => Promise<boolean>;
    };
  }
}
