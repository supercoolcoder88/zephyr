import type { SQLiteDatabase } from "expo-sqlite";

import { refreshAllDailyReviews } from "./dailyReview";

export type Task = {
  id: number;
  title: string;
  description: string | null;
  deadline: string | null;
};

export type TaskWithCompletion = Task & {
  status: "INCOMPLETE" | "INPROGRESS" | "COMPLETE";
};

export type CreateTaskInput = {
  title: string;
  description?: string | null;
  deadline?: string | null;
};

export type UpdateTaskInput = Partial<Omit<Task, "id">>;

export async function createTask(
  database: SQLiteDatabase,
  input: CreateTaskInput,
): Promise<Task> {
  const description = input.description ?? null;
  const deadline = input.deadline ?? null;
  const result = await database.runAsync(
    "INSERT INTO task (title, description, deadline) VALUES (?, ?, ?)",
    input.title,
    description,
    deadline,
  );
  await refreshAllDailyReviews(database);

  return {
    id: result.lastInsertRowId,
    title: input.title,
    description,
    deadline,
  };
}

export function getTask(
  database: SQLiteDatabase,
  id: number,
): Promise<Task | null> {
  return database.getFirstAsync<Task>(
    "SELECT id, title, description, deadline FROM task WHERE id = ?",
    id,
  );
}

export function getAllTasks(database: SQLiteDatabase): Promise<Task[]> {
  return database.getAllAsync<Task>(
    "SELECT id, title, description, deadline FROM task ORDER BY id",
  );
}

export function getTasksWithCompletion(
  database: SQLiteDatabase,
  date: string,
): Promise<TaskWithCompletion[]> {
  return database.getAllAsync<TaskWithCompletion>(
    `
      SELECT
        task.id,
        task.title,
        task.description,
        task.deadline,
        COALESCE(task_log.status, 'INCOMPLETE') AS status
      FROM task
      LEFT JOIN task_log
        ON task_log.task_id = task.id
        AND task_log.date = ?
      ORDER BY
        CASE COALESCE(task_log.status, 'INCOMPLETE')
          WHEN 'COMPLETE' THEN 1
          ELSE 0
        END,
        task.id
    `,
    date,
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

  if (input.description !== undefined) {
    updates.push("description = ?");
    params.push(input.description);
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
    await refreshAllDailyReviews(database);
  }

  return getTask(database, id);
}

export async function deleteTask(
  database: SQLiteDatabase,
  id: number,
): Promise<void> {
  await database.runAsync("DELETE FROM task WHERE id = ?", id);
  await refreshAllDailyReviews(database);
}
