import type { SQLiteDatabase } from "expo-sqlite";

export type Task = {
  id: number;
  title: string;
  deadline: string | null;
}

export type CreateTaskInput = {
  title: string;
  deadline?: string | null;
};

export type UpdateTaskInput = Partial<Omit<Task, "id">>;

export async function createTask(
  database: SQLiteDatabase,
  input: CreateTaskInput,
): Promise<Task> {
  const deadline = input.deadline ?? null;
  const result = await database.runAsync(
    "INSERT INTO task (title, deadline) VALUES (?, ?)",
    input.title,
    deadline,
  );

  return {
    id: result.lastInsertRowId,
    title: input.title,
    deadline,
  };
}

export function getTask(
  database: SQLiteDatabase,
  id: number,
): Promise<Task | null> {
  return database.getFirstAsync<Task>(
    "SELECT id, title, deadline FROM task WHERE id = ?",
    id,
  );
}

export function getAllTasks(database: SQLiteDatabase): Promise<Task[]> {
  return database.getAllAsync<Task>(
    "SELECT id, title, deadline FROM task ORDER BY id",
  );
}

export async function updateTask(
  database: SQLiteDatabase,
  id: number,
  input: UpdateTaskInput,
): Promise<Task | null> {
  const updates: string[] = [];
  const params: Array<string | number | null> = [];

  if (input.title !== undefined) {
    updates.push("title = ?");
    params.push(input.title);
  }

  if (input.deadline !== undefined) {
    updates.push("deadline = ?");
    params.push(input.deadline);
  }

  if (updates.length > 0) {
    await database.runAsync(
      `UPDATE task SET ${updates.join(", ")} WHERE id = ?`,
      [...params, id],
    );
  }

  return getTask(database, id);
}

export async function deleteTask(
  database: SQLiteDatabase,
  id: number,
): Promise<void> {
  await database.runAsync("DELETE FROM task WHERE id = ?", id);
}
