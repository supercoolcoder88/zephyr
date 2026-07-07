import type { SQLiteDatabase } from "expo-sqlite";

export type Tag = {
  id: number;
  title: string;
};

export type CreateTagInput = {
  title: string;
};

export type UpdateTagInput = Partial<Omit<Tag, "id">>;

export async function createTag(
  database: SQLiteDatabase,
  input: CreateTagInput,
): Promise<Tag> {
  const result = await database.runAsync(
    "INSERT INTO tag (title) VALUES (?)",
    input.title,
  );

  return {
    id: result.lastInsertRowId,
    title: input.title,
  };
}

export function getTag(
  database: SQLiteDatabase,
  id: number,
): Promise<Tag | null> {
  return database.getFirstAsync<Tag>(
    "SELECT id, title FROM tag WHERE id = ?",
    id,
  );
}

export async function updateTag(
  database: SQLiteDatabase,
  id: number,
  input: UpdateTagInput,
): Promise<Tag | null> {
  if (input.title !== undefined) {
    await database.runAsync(
      "UPDATE tag SET title = ? WHERE id = ?",
      input.title,
      id,
    );
  }

  return getTag(database, id);
}

export async function deleteTag(
  database: SQLiteDatabase,
  id: number,
): Promise<void> {
  await database.runAsync("DELETE FROM tag WHERE id = ?", id);
}
