import type { SQLiteDatabase } from "expo-sqlite";

export type HabitLogStatus = "INCOMPLETE" | "COMPLETE";

export type HabitLog = {
  habitId: number;
  date: string;
  status: HabitLogStatus;
};

export type CreateHabitLogInput = HabitLog;

type HabitLogRow = {
  habitId: number;
  date: string;
  status: HabitLogStatus;
};

export async function createHabitLog(
  database: SQLiteDatabase,
  input: CreateHabitLogInput,
): Promise<HabitLog> {
  await database.runAsync(
    "INSERT INTO habit_log (habit_id, date, status) VALUES (?, ?, ?)",
    input.habitId,
    input.date,
    input.status,
  );
  return input;
}

export function getHabitLog(
  database: SQLiteDatabase,
  habitId: number,
  date: string,
): Promise<HabitLog | null> {
  return database.getFirstAsync<HabitLogRow>(
    `
      SELECT habit_id AS habitId, date, status
      FROM habit_log
      WHERE habit_id = ? AND date = ?
    `,
    habitId,
    date,
  );
}

export function getAllHabitLogs(database: SQLiteDatabase): Promise<HabitLog[]> {
  return database.getAllAsync<HabitLogRow>(`
    SELECT habit_id AS habitId, date, status
    FROM habit_log
    ORDER BY date, habit_id
  `);
}

export async function updateHabitLogStatus(
  database: SQLiteDatabase,
  habitId: number,
  date: string,
): Promise<HabitLog> {
  const currentLog = await getHabitLog(database, habitId, date);
  const currentStatus: HabitLogStatus = currentLog?.status ?? "INCOMPLETE";
  const nextStatus: HabitLogStatus =
    currentStatus === "COMPLETE" ? "INCOMPLETE" : "COMPLETE";

  if (currentLog) {
    await database.runAsync(
      "UPDATE habit_log SET status = ? WHERE habit_id = ? AND date = ?",
      nextStatus,
      habitId,
      date,
    );
  } else {
    await database.runAsync(
      "INSERT INTO habit_log (habit_id, date, status) VALUES (?, ?, ?)",
      habitId,
      date,
      nextStatus,
    );
  }

  return {
    habitId,
    date,
    status: nextStatus,
  };
}

export async function deleteHabitLog(
  database: SQLiteDatabase,
  habitId: number,
  date: string,
): Promise<void> {
  await database.runAsync(
    "DELETE FROM habit_log WHERE habit_id = ? AND date = ?",
    habitId,
    date,
  );
}
