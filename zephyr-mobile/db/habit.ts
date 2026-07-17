import type { SQLiteDatabase } from "expo-sqlite";

import { shiftDateKey } from "../utils/date";

export type Habit = {
  id: number;
  title: string;
};

export type HabitWithCompletion = Habit & {
  status: "INCOMPLETE" | "COMPLETE";
  streak: number;
};

export type CreateHabitInput = {
  title: string;
};

export type UpdateHabitInput = Partial<Omit<Habit, "id">>;

export async function createHabit(
  database: SQLiteDatabase,
  input: CreateHabitInput,
): Promise<Habit> {
  const result = await database.runAsync(
    "INSERT INTO habit (title) VALUES (?)",
    input.title,
  );
  return {
    id: result.lastInsertRowId,
    title: input.title,
  };
}

export function getHabit(
  database: SQLiteDatabase,
  id: number,
): Promise<Habit | null> {
  return database.getFirstAsync<Habit>(
    "SELECT id, title FROM habit WHERE id = ?",
    id,
  );
}

export function getAllHabits(database: SQLiteDatabase): Promise<Habit[]> {
  return database.getAllAsync<Habit>("SELECT id, title FROM habit ORDER BY id");
}

type CompletedHabitLogRow = {
  habitId: number;
  date: string;
};

export function getHabitStreak(completedDates: string[], today: string) {
  const dates = new Set(completedDates);
  let currentDate = dates.has(today) ? today : shiftDateKey(today, -1);
  let streak = 0;

  while (dates.has(currentDate)) {
    streak += 1;
    currentDate = shiftDateKey(currentDate, -1);
  }

  return streak;
}

export async function getHabitsWithCompletion(
  database: SQLiteDatabase,
  date: string,
): Promise<HabitWithCompletion[]> {
  const habits = await database.getAllAsync<
    Omit<HabitWithCompletion, "streak">
  >(
    `
      SELECT
        habit.id,
        habit.title,
        COALESCE(habit_log.status, 'INCOMPLETE') AS status
      FROM habit
      LEFT JOIN habit_log
        ON habit_log.habit_id = habit.id
        AND habit_log.date = ?
      ORDER BY
        CASE COALESCE(habit_log.status, 'INCOMPLETE')
          WHEN 'COMPLETE' THEN 1
          ELSE 0
        END,
        habit.id
    `,
    date,
  );
  const completedLogs = await database.getAllAsync<CompletedHabitLogRow>(
    `
      SELECT habit_id AS habitId, date
      FROM habit_log
      WHERE status = 'COMPLETE' AND date <= ?
      ORDER BY habit_id, date DESC
    `,
    date,
  );
  const datesByHabit = new Map<number, string[]>();

  for (const log of completedLogs) {
    const dates = datesByHabit.get(log.habitId) ?? [];
    dates.push(log.date);
    datesByHabit.set(log.habitId, dates);
  }

  return habits.map((habit) => ({
    ...habit,
    streak: getHabitStreak(datesByHabit.get(habit.id) ?? [], date),
  }));
}

export async function updateHabit(
  database: SQLiteDatabase,
  id: number,
  input: UpdateHabitInput,
): Promise<Habit | null> {
  const updates: string[] = [];
  const params: string[] = [];

  if (input.title !== undefined) {
    updates.push("title = ?");
    params.push(input.title);
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
