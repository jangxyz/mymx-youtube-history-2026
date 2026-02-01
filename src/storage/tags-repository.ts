import { eq, sql, like } from 'drizzle-orm';
import type { DrizzleDB } from './database.js';
import { tags, videoTags } from './schema.js';
import type { TagRecord, NewTagRecord } from './schema.js';

/**
 * Tag with usage count
 */
export interface TagWithCount extends TagRecord {
  videoCount: number;
}

/**
 * Repository for tags management
 */
export class TagsRepository {
  private db: DrizzleDB;

  constructor(db: DrizzleDB) {
    this.db = db;
  }

  /**
   * Create a new tag
   */
  async create(name: string, color?: string): Promise<TagRecord> {
    const result = this.db
      .insert(tags)
      .values({
        name: name.trim(),
        color: color ?? null,
      })
      .returning()
      .get();

    return result;
  }

  /**
   * Get a tag by ID
   */
  async getById(id: number): Promise<TagRecord | null> {
    const result = this.db
      .select()
      .from(tags)
      .where(eq(tags.id, id))
      .get();

    return result ?? null;
  }

  /**
   * Get a tag by name
   */
  async getByName(name: string): Promise<TagRecord | null> {
    const result = this.db
      .select()
      .from(tags)
      .where(eq(tags.name, name.trim()))
      .get();

    return result ?? null;
  }

  /**
   * List all tags with video counts
   */
  async listWithCounts(): Promise<TagWithCount[]> {
    const allTags = this.db.select().from(tags).all();

    // Get counts for each tag
    const result: TagWithCount[] = [];
    for (const tag of allTags) {
      const count = this.db
        .select()
        .from(videoTags)
        .where(eq(videoTags.tagId, tag.id))
        .all().length;

      result.push({
        ...tag,
        videoCount: count,
      });
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * List all tags (simple)
   */
  async list(): Promise<TagRecord[]> {
    return this.db
      .select()
      .from(tags)
      .orderBy(tags.name)
      .all();
  }

  /**
   * Search tags by name
   */
  async search(query: string): Promise<TagRecord[]> {
    return this.db
      .select()
      .from(tags)
      .where(like(tags.name, `%${query}%`))
      .orderBy(tags.name)
      .all();
  }

  /**
   * Rename a tag
   */
  async rename(id: number, newName: string): Promise<TagRecord | null> {
    const result = this.db
      .update(tags)
      .set({ name: newName.trim() })
      .where(eq(tags.id, id))
      .returning()
      .get();

    return result ?? null;
  }

  /**
   * Update tag color
   */
  async updateColor(id: number, color: string | null): Promise<TagRecord | null> {
    const result = this.db
      .update(tags)
      .set({ color })
      .where(eq(tags.id, id))
      .returning()
      .get();

    return result ?? null;
  }

  /**
   * Delete a tag (also removes all video associations)
   */
  async delete(id: number): Promise<boolean> {
    const result = this.db
      .delete(tags)
      .where(eq(tags.id, id))
      .run();

    return result.changes > 0;
  }

  /**
   * Check if tag name exists
   */
  async exists(name: string): Promise<boolean> {
    const result = await this.getByName(name);
    return result !== null;
  }

  /**
   * Get or create a tag by name
   */
  async getOrCreate(name: string, color?: string): Promise<TagRecord> {
    const existing = await this.getByName(name);
    if (existing) {
      return existing;
    }
    return this.create(name, color);
  }
}
