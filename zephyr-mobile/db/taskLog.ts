import type { SQLiteDatabase } from "expo-sqlite";

export type TaskLogStatus = "INCOMPLETE" | "INPROGRESS" | "COMPLETE";

export type TaskLog = {
  taskId: number;
  date: string;
  status: TaskLogStatus;
};

export type CreateTaskLogInput = TaskLog;

export type UpdateTaskLogInput = {
  status?: TaskLogStatus;
};

type TaskLogRow = {
  taskId: number;
  date: string;
  status: TaskLogStatus;
};

export async function createTaskLog(
  database: SQLiteDatabase,
  input: CreateTaskLogInput,
): Promise<TaskLog> {
  await database.runAsync(
    "INSERT INTO task_log (task_id, date, status) VALUES (?, ?, ?)",
    input.taskId,
    input.date,
    input.status,
  );

  return input;
}

export function getTaskLog(
  database: SQLiteDatabase,
  taskId: number,
  date: string,
): Promise<TaskLog | null> {
  return database.getFirstAsync<TaskLogRow>(
    `
      SELECT task_id AS taskId, date, status
      FROM task_log
      WHERE task_id = ? AND date = ?
    `,
    taskId,
    date,
  );
}

export async function updateTaskLog(
  database: SQLiteDatabase,
  taskId: number,
  date: string,
  input: UpdateTaskLogInput,
): Promise<TaskLog | null> {
  if (input.status !== undefined) {
    await database.runAsync(
      "UPDATE task_log SET status = ? WHERE task_id = ? AND date = ?",
      input.status,
      taskId,
      date,
    );
  }

  return getTaskLog(database, taskId, date);
}

export async function deleteTaskLog(
  database: SQLiteDatabase,
  taskId: number,
  date: string,
): Promise<void> {
  await database.runAsync(
    "DELETE FROM task_log WHERE task_id = ? AND date = ?",
    taskId,
    date,
  );
}
