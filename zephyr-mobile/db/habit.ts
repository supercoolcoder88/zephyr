import type { SQLiteDatabase } from "expo-sqlite";

export type Habit = {
  id: number;
  title: string;
  score: number;
};

export type CreateHabitInput = {
  title: string;
  score?: number;
};

export type UpdateHabitInput = Partial<Omit<Habit, "id">>;

export async function createHabit(
  database: SQLiteDatabase,
  input: CreateHabitInput,
): Promise<Habit> {
  const result = await database.runAsync(
    "INSERT INTO habit (title, score) VALUES (?, ?)",
    input.title,
    input.score ?? 0,
  );

  return {
    id: result.lastInsertRowId,
    title: input.title,
    score: input.score ?? 0,
  };
}

export function getHabit(
  database: SQLiteDatabase,
  id: number,
): Promise<Habit | null> {
  return database.getFirstAsync<Habit>(
    "SELECT id, title, score FROM habit WHERE id = ?",
    id,
  );
}

export async function updateHabit(
  database: SQLiteDatabase,
  id: number,
  input: UpdateHabitInput,
): Promise<Habit | null> {
  const updates: string[] = [];
  const params: Array<string | number> = [];

  if (input.title !== undefined) {
    updates.push("title = ?");
    params.push(input.title);
  }

  if (input.score !== undefined) {
    updates.push("score = ?");
    params.push(input.score);
  }

  if (updates.length > 0) {
    await database.runAsync(
      `UPDATE habit SET ${updates.join(", ")} WHERE id = ?`,
      [...params, id],
    );
  }

  return getHabit(database, id);
}

export async function deleteHabit(
  database: SQLiteDatabase,
  id: number,
): Promise<void> {
  await database.runAsync("DELETE FROM habit WHERE id = ?", id);
}
