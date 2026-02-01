import type { DrizzleDB } from './database.js';
import { WatchHistoryRepository } from './repository.js';
import { NotesRepository } from './notes-repository.js';
import { TagsRepository } from './tags-repository.js';
import { VideoTagsRepository } from './video-tags-repository.js';
import type { StoredWatchHistoryEntry } from './types.js';

/**
 * Export entry with annotations
 */
export interface ExportEntry {
  videoId: string;
  title: string;
  url: string;
  channelName: string | null;
  channelUrl: string | null;
  thumbnailUrl: string;
  watchedAt: string;
  isAd: boolean;
  source: 'takeout' | 'playwright';
  notes: string[];
  tags: string[];
}

/**
 * Export result
 */
export interface ExportResult {
  entries: ExportEntry[];
  stats: {
    totalEntries: number;
    entriesWithNotes: number;
    entriesWithTags: number;
    totalNotes: number;
    totalTags: number;
  };
}

/**
 * Import result
 */
export interface ImportResult {
  imported: number;
  duplicates: number;
  notesCreated: number;
  tagsCreated: number;
  tagAssignments: number;
  errors: Array<{ index: number; message: string }>;
}

/**
 * Service for exporting and importing watch history with annotations
 */
export class ExportService {
  private db: DrizzleDB;
  private repo: WatchHistoryRepository;
  private notesRepo: NotesRepository;
  private tagsRepo: TagsRepository;
  private videoTagsRepo: VideoTagsRepository;

  constructor(db: DrizzleDB) {
    this.db = db;
    this.repo = new WatchHistoryRepository(db);
    this.notesRepo = new NotesRepository(db);
    this.tagsRepo = new TagsRepository(db);
    this.videoTagsRepo = new VideoTagsRepository(db);
  }

  /**
   * Export all watch history with annotations
   */
  async exportAll(): Promise<ExportResult> {
    const entries: ExportEntry[] = [];
    let entriesWithNotes = 0;
    let entriesWithTags = 0;
    let totalNotes = 0;

    // Get all entries (in batches for large datasets)
    const total = await this.repo.count();
    const batchSize = 1000;
    let offset = 0;

    while (offset < total) {
      const batch = await this.repo.query({ limit: batchSize, offset });

      for (const entry of batch) {
        const exportEntry = await this.buildExportEntry(entry);
        entries.push(exportEntry);

        if (exportEntry.notes.length > 0) {
          entriesWithNotes++;
          totalNotes += exportEntry.notes.length;
        }
        if (exportEntry.tags.length > 0) {
          entriesWithTags++;
        }
      }

      offset += batchSize;
    }

    const allTags = await this.tagsRepo.list();

    return {
      entries,
      stats: {
        totalEntries: entries.length,
        entriesWithNotes,
        entriesWithTags,
        totalNotes,
        totalTags: allTags.length,
      },
    };
  }

  /**
   * Export to JSONL string
   */
  async exportToJsonl(): Promise<string> {
    const result = await this.exportAll();
    return result.entries.map((entry) => JSON.stringify(entry)).join('\n');
  }

  /**
   * Import from JSONL string
   */
  async importFromJsonl(jsonl: string): Promise<ImportResult> {
    const lines = jsonl.trim().split('\n').filter((line) => line.trim());
    const result: ImportResult = {
      imported: 0,
      duplicates: 0,
      notesCreated: 0,
      tagsCreated: 0,
      tagAssignments: 0,
      errors: [],
    };

    for (let i = 0; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i]) as ExportEntry;
        await this.importEntry(entry, result);
      } catch (err) {
        result.errors.push({
          index: i,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return result;
  }

  /**
   * Build export entry with annotations
   */
  private async buildExportEntry(entry: StoredWatchHistoryEntry): Promise<ExportEntry> {
    const notes = await this.notesRepo.getByWatchHistoryId(entry.id);
    const tags = await this.videoTagsRepo.getTagsForVideo(entry.id);

    return {
      videoId: entry.videoId,
      title: entry.title,
      url: entry.url,
      channelName: entry.channelName,
      channelUrl: entry.channelUrl,
      thumbnailUrl: entry.thumbnailUrl,
      watchedAt: entry.watchedAt,
      isAd: entry.isAd,
      source: entry.source,
      notes: notes.map((n) => n.content),
      tags: tags.map((t) => t.name),
    };
  }

  /**
   * Import a single entry with annotations
   */
  private async importEntry(entry: ExportEntry, result: ImportResult): Promise<void> {
    // Insert the watch history entry
    const inserted = await this.repo.insert({
      videoId: entry.videoId,
      title: entry.title,
      url: entry.url,
      channelName: entry.channelName,
      channelUrl: entry.channelUrl,
      thumbnailUrl: entry.thumbnailUrl,
      watchedAt: entry.watchedAt,
      isAd: entry.isAd,
      source: entry.source,
    });

    if (inserted) {
      result.imported++;
    } else {
      result.duplicates++;
    }

    // Get the watch history ID (may already exist)
    const entries = await this.repo.getByVideoId(entry.videoId);

    if (entries.length === 0) {
      return; // Should not happen, but safety check
    }

    const watchHistoryId = entries.find(
      (e) => e.watchedAt === entry.watchedAt
    )?.id;

    if (!watchHistoryId) {
      return;
    }

    // Import notes
    for (const noteContent of entry.notes ?? []) {
      await this.notesRepo.add(watchHistoryId, noteContent);
      result.notesCreated++;
    }

    // Import tags
    for (const tagName of entry.tags ?? []) {
      const tag = await this.tagsRepo.getOrCreate(tagName);
      if (!(await this.videoTagsRepo.hasTag(watchHistoryId, tag.id))) {
        await this.videoTagsRepo.assign(watchHistoryId, tag.id);
        result.tagAssignments++;
      }
    }
  }
}
