export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  includeAds?: boolean;
}

export interface HistoryEntry {
  id: number;
  videoId: string;
  title: string;
  url: string;
  channelName: string | null;
  channelUrl: string | null;
  watchedAt: string;
  isAd: boolean;
  thumbnailUrl: string;
  source: string;
}

export interface Stats {
  total: number;
  nonAds: number;
  ads: number;
  lastTakeoutImport: string | null;
  lastPlaywrightSync: string | null;
  latestWatched: string | null;
}

export interface ImportResult {
  success: boolean;
  error?: string;
  stats?: {
    inserted: number;
    duplicatesInDb: number;
  };
}

interface ElectronAPI {
  getAppVersion(): Promise<string>;
  showOpenDialog(): Promise<string | null>;
  importTakeout(filePath: string): Promise<ImportResult>;
  getHistory(options: QueryOptions): Promise<{ entries: HistoryEntry[]; total: number }>;
  getStats(): Promise<Stats>;
  deleteEntry(id: number): Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export const api = window.electronAPI;
