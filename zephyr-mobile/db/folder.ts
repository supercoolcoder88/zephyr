import type { SQLiteDatabase } from "expo-sqlite";

export type Folder = {
  id: number;
  name: string;
};

export function getAllFolders(database: SQLiteDatabase): Promise<Folder[]> {
  return database.getAllAsync<Folder>(`
    SELECT tag.id, tag.title AS name
    FROM tag
    WHERE tag.kind = 'FOLDER'
      AND EXISTS (
        SELECT 1
        FROM task_tag
        WHERE task_tag.tagId = tag.id
      )
    ORDER BY tag.title COLLATE NOCASE
  `);
}
