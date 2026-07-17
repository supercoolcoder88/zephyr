import type { SQLiteDatabase } from "expo-sqlite";

import { shiftDateKey } from "../utils/date";

export type HabitCompletionDay = {
  date: string;
  completed: number;
};

export type HabitCompletionBreakdown = {
  id: number;
  title: string;
  completedDates: string[];
};

type HabitCompletionRow = HabitCompletionDay;
type HabitCompletionBreakdownRow = {
  id: number;
  title: string;
  date: string | null;
};

export async function getHabitCompletionHistory(
  database: SQLiteDatabase,
  endDate: string,
  numberOfDays = 7,
): Promise<HabitCompletionDay[]> {
  const startDate = shiftDateKey(endDate, -(numberOfDays - 1));
  const rows = await database.getAllAsync<HabitCompletionRow>(
    `
      SELECT date, COUNT(*) AS completed
      FROM habit_log
      WHERE status = 'COMPLETE' AND date BETWEEN ? AND ?
      GROUP BY date
      ORDER BY date
    `,
    startDate,
    endDate,
  );
  const completionsByDate = new Map(
    rows.map((row) => [row.date, row.completed]),
  );

  return Array.from({ length: numberOfDays }, (_, index) => {
    const date = shiftDateKey(startDate, index);

    return {
      date,
      completed: completionsByDate.get(date) ?? 0,
    };
  });
}

export async function getHabitCompletionBreakdown(
  database: SQLiteDatabase,
  endDate: string,
  numberOfDays = 7,
): Promise<HabitCompletionBreakdown[]> {
  const startDate = shiftDateKey(endDate, -(numberOfDays - 1));
  const rows = await database.getAllAsync<HabitCompletionBreakdownRow>(
    `
      SELECT habit.id, habit.title, habit_log.date
      FROM habit
      LEFT JOIN habit_log
        ON habit_log.habit_id = habit.id
        AND habit_log.status = 'COMPLETE'
        AND habit_log.date BETWEEN ? AND ?
      ORDER BY habit.id, habit_log.date
    `,
    startDate,
    endDate,
  );
  const habits = new Map<number, HabitCompletionBreakdown>();

  for (const row of rows) {
    const habit = habits.get(row.id) ?? {
      id: row.id,
      title: row.title,
      completedDates: [],
    };

    if (row.date) {
      habit.completedDates.push(row.date);
    }

    habits.set(row.id, habit);
  }

  return [...habits.values()];
}
