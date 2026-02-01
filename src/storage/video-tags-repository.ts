import { eq, and, inArray } from 'drizzle-orm';
import type { DrizzleDB } from './database.js';
import { videoTags, tags } from './schema.js';
import type { TagRecord, VideoTagRecord } from './schema.js';

/**
 * Repository for video-tag assignments
 */
export class VideoTagsRepository {
  private db: DrizzleDB;

  constructor(db: DrizzleDB) {
    this.db = db;
  }

  /**
   * Assign a tag to a video
   */
  async assign(watchHistoryId: number, tagId: number): Promise<boolean> {
    try {
      this.db
        .insert(videoTags)
        .values({ watchHistoryId, tagId })
        .onConflictDoNothing()
        .run();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove a tag from a video
   */
  async remove(watchHistoryId: number, tagId: number): Promise<boolean> {
    const result = this.db
      .delete(videoTags)
      .where(
        and(
          eq(videoTags.watchHistoryId, watchHistoryId),
          eq(videoTags.tagId, tagId)
        )
      )
      .run();

    return result.changes > 0;
  }

  /**
   * Get all tags for a video
   */
  async getTagsForVideo(watchHistoryId: number): Promise<TagRecord[]> {
    const assignments = this.db
      .select()
      .from(videoTags)
      .where(eq(videoTags.watchHistoryId, watchHistoryId))
      .all();

    if (assignments.length === 0) {
      return [];
    }

    const tagIds = assignments.map((a) => a.tagId);
    return this.db
      .select()
      .from(tags)
      .where(inArray(tags.id, tagIds))
      .all();
  }

  /**
   * Get all video IDs that have a specific tag
   */
  async getVideoIdsByTag(tagId: number): Promise<number[]> {
    const assignments = this.db
      .select()
      .from(videoTags)
      .where(eq(videoTags.tagId, tagId))
      .all();

    return assignments.map((a) => a.watchHistoryId);
  }

  /**
   * Set all tags for a video (replaces existing)
   */
  async setVideoTags(watchHistoryId: number, tagIds: number[]): Promise<void> {
    // Remove all existing tags
    this.db
      .delete(videoTags)
      .where(eq(videoTags.watchHistoryId, watchHistoryId))
      .run();

    // Add new tags
    if (tagIds.length > 0) {
      const values = tagIds.map((tagId) => ({ watchHistoryId, tagId }));
      this.db.insert(videoTags).values(values).run();
    }
  }

  /**
   * Bulk assign a tag to multiple videos
   */
  async bulkAssign(watchHistoryIds: number[], tagId: number): Promise<number> {
    let assigned = 0;
    for (const watchHistoryId of watchHistoryIds) {
      const success = await this.assign(watchHistoryId, tagId);
      if (success) assigned++;
    }
    return assigned;
  }

  /**
   * Bulk remove a tag from multiple videos
   */
  async bulkRemove(watchHistoryIds: number[], tagId: number): Promise<number> {
    let removed = 0;
    for (const watchHistoryId of watchHistoryIds) {
      const success = await this.remove(watchHistoryId, tagId);
      if (success) removed++;
    }
    return removed;
  }

  /**
   * Check if a video has a specific tag
   */
  async hasTag(watchHistoryId: number, tagId: number): Promise<boolean> {
    const result = this.db
      .select()
      .from(videoTags)
      .where(
        and(
          eq(videoTags.watchHistoryId, watchHistoryId),
          eq(videoTags.tagId, tagId)
        )
      )
      .get();

    return result !== undefined;
  }

  /**
   * Count videos with a specific tag
   */
  async countByTag(tagId: number): Promise<number> {
    const result = this.db
      .select()
      .from(videoTags)
      .where(eq(videoTags.tagId, tagId))
      .all();

    return result.length;
  }
}
