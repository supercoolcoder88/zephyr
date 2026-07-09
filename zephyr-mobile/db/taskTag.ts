import type { SQLiteDatabase } from "expo-sqlite";

export type TaskTag = {
  taskId: number;
  tagId: number;
};

type TaskTagRow = {
  taskId: number;
  tagId: number;
};

export function getAllTaskTags(database: SQLiteDatabase): Promise<TaskTag[]> {
  return database.getAllAsync<TaskTagRow>(`
    SELECT taskId, tagId
    FROM task_tag
    ORDER BY taskId, tagId
  `);
}
