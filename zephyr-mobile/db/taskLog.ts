import type { SQLiteDatabase } from "expo-sqlite";

import { refreshDailyReview } from "./dailyReview";

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
  await refreshDailyReview(database, input.date);

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

export function getAllTaskLogs(database: SQLiteDatabase): Promise<TaskLog[]> {
  return database.getAllAsync<TaskLogRow>(`
    SELECT task_id AS taskId, date, status
    FROM task_log
    ORDER BY date, task_id
  `);
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
    await refreshDailyReview(database, date);
  }

  return getTaskLog(database, taskId, date);
}

export async function updateTaskLogStatus(
  database: SQLiteDatabase,
  taskId: number,
  date: string,
): Promise<TaskLog> {
  const currentLog = await getTaskLog(database, taskId, date);
  const currentStatus: TaskLogStatus = currentLog?.status ?? "INCOMPLETE";
  const nextStatus: TaskLogStatus =
    currentStatus === "COMPLETE" ? "INCOMPLETE" : "COMPLETE";

  if (currentLog) {
    await database.runAsync(
      "UPDATE task_log SET status = ? WHERE task_id = ? AND date = ?",
      nextStatus,
      taskId,
      date,
    );
  } else {
    await database.runAsync(
      "INSERT INTO task_log (task_id, date, status) VALUES (?, ?, ?)",
      taskId,
      date,
      nextStatus,
    );
  }

  await refreshDailyReview(database, date);

  return {
    taskId,
    date,
    status: nextStatus,
  };
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
  await refreshDailyReview(database, date);
}
