import type { SQLiteDatabase } from "expo-sqlite";

export type HabitLogStatus = "INCOMPLETE" | "COMPLETE";

export type HabitLog = {
  habitId: number;
  date: string;
  status: HabitLogStatus;
};

export type CreateHabitLogInput = HabitLog;

export type UpdateHabitLogInput = {
  status?: HabitLogStatus;
};

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

export async function updateHabitLog(
  database: SQLiteDatabase,
  habitId: number,
  date: string,
  input: UpdateHabitLogInput,
): Promise<HabitLog | null> {
  if (input.status !== undefined) {
    await database.runAsync(
      "UPDATE habit_log SET status = ? WHERE habit_id = ? AND date = ?",
      input.status,
      habitId,
      date,
    );
  }

  return getHabitLog(database, habitId, date);
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
