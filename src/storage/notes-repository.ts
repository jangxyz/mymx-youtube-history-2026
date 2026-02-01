import { eq, desc } from 'drizzle-orm';
import type { DrizzleDB } from './database.js';
import { notes } from './schema.js';
import type { NoteRecord, NewNoteRecord } from './schema.js';

/**
 * Repository for notes CRUD operations
 */
export class NotesRepository {
  private db: DrizzleDB;

  constructor(db: DrizzleDB) {
    this.db = db;
  }

  /**
   * Add a note to a video
   */
  async add(watchHistoryId: number, content: string): Promise<NoteRecord> {
    const result = this.db
      .insert(notes)
      .values({
        watchHistoryId,
        content,
      })
      .returning()
      .get();

    return result;
  }

  /**
   * Get a note by ID
   */
  async getById(id: number): Promise<NoteRecord | null> {
    const result = this.db
      .select()
      .from(notes)
      .where(eq(notes.id, id))
      .get();

    return result ?? null;
  }

  /**
   * Get all notes for a video
   */
  async getByWatchHistoryId(watchHistoryId: number): Promise<NoteRecord[]> {
    return this.db
      .select()
      .from(notes)
      .where(eq(notes.watchHistoryId, watchHistoryId))
      .orderBy(desc(notes.createdAt))
      .all();
  }

  /**
   * Update a note's content
   */
  async update(id: number, content: string): Promise<NoteRecord | null> {
    const result = this.db
      .update(notes)
      .set({
        content,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(notes.id, id))
      .returning()
      .get();

    return result ?? null;
  }

  /**
   * Delete a note
   */
  async delete(id: number): Promise<boolean> {
    const result = this.db
      .delete(notes)
      .where(eq(notes.id, id))
      .run();

    return result.changes > 0;
  }

  /**
   * Delete all notes for a video
   */
  async deleteByWatchHistoryId(watchHistoryId: number): Promise<number> {
    const result = this.db
      .delete(notes)
      .where(eq(notes.watchHistoryId, watchHistoryId))
      .run();

    return result.changes;
  }

  /**
   * Count notes for a video
   */
  async countByWatchHistoryId(watchHistoryId: number): Promise<number> {
    const result = this.db
      .select()
      .from(notes)
      .where(eq(notes.watchHistoryId, watchHistoryId))
      .all();

    return result.length;
  }
}
