import type { SQLiteDatabase } from "expo-sqlite";

import { getLocalDateKey } from "../utils/date";

export type DailyReview = {
  id: number;
  date: string;
  habitsCompleted: number;
  habitsIncomplete: number;
};

type DailyReviewRow = {
  id: number;
  date: string;
  habitsCompleted: number;
  habitsIncomplete: number;
};

type DailyReviewCounts = Omit<DailyReview, "id" | "date">;

export async function rolloverDailyReview(
  database: SQLiteDatabase,
  now = new Date(),
) {
  const today = getLocalDateKey(now);
  const latestReview = await database.getFirstAsync<{ date: string }>(`
    SELECT date
    FROM daily_review
    ORDER BY date DESC
    LIMIT 1
  `);

  if (latestReview?.date === today) {
    return;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  await database.withTransactionAsync(async () => {
    if (latestReview) {
      await refreshDailyReview(database, getLocalDateKey(yesterday));
    }

    await getOrCreateDailyReviewByDate(database, today);
  });
}

export async function getOrCreateDailyReviewByDate(
  database: SQLiteDatabase,
  date: string,
): Promise<DailyReview> {
  await database.runAsync(
    `
      INSERT INTO daily_review (date)
      VALUES (?)
      ON CONFLICT(date) DO NOTHING
    `,
    date,
  );

  return refreshDailyReview(database, date);
}

export async function refreshDailyReview(
  database: SQLiteDatabase,
  date: string,
): Promise<DailyReview> {
  const counts = await getDailyReviewCounts(database, date);

  await database.runAsync(
    `
      INSERT INTO daily_review (
        date,
        habits_completed,
        habits_incomplete
      )
      VALUES (?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        habits_completed = excluded.habits_completed,
        habits_incomplete = excluded.habits_incomplete
    `,
    date,
    counts.habitsCompleted,
    counts.habitsIncomplete,
  );

  const review = await getDailyReviewByDate(database, date);

  if (!review) {
    throw new Error("Unable to create daily review.");
  }

  return review;
}

export function getDailyReviewByDate(
  database: SQLiteDatabase,
  date: string,
): Promise<DailyReview | null> {
  return database.getFirstAsync<DailyReviewRow>(
    `
      SELECT
        id,
        date,
        habits_completed AS habitsCompleted,
        habits_incomplete AS habitsIncomplete
      FROM daily_review
      WHERE date = ?
    `,
    date,
  );
}

export function getAllDailyReviews(
  database: SQLiteDatabase,
): Promise<DailyReview[]> {
  return database.getAllAsync<DailyReviewRow>(`
    SELECT
      id,
      date,
      habits_completed AS habitsCompleted,
      habits_incomplete AS habitsIncomplete
    FROM daily_review
    ORDER BY date DESC
  `);
}

export async function refreshAllDailyReviews(
  database: SQLiteDatabase,
): Promise<void> {
  const reviews = await getAllDailyReviews(database);

  await Promise.all(
    reviews.map((review) => refreshDailyReview(database, review.date)),
  );
}

export async function deleteDailyReview(
  database: SQLiteDatabase,
  id: number,
): Promise<void> {
  await database.runAsync("DELETE FROM daily_review WHERE id = ?", id);
}

async function getDailyReviewCounts(
  database: SQLiteDatabase,
  date: string,
): Promise<DailyReviewCounts> {
  const habitCounts = await database.getFirstAsync<{
    completed: number;
    total: number;
  }>(
    `
      SELECT
        COUNT(habit.id) AS total,
        COUNT(CASE WHEN habit_log.status = 'COMPLETE' THEN 1 END) AS completed
      FROM habit
      LEFT JOIN habit_log
        ON habit_log.habit_id = habit.id
        AND habit_log.date = ?
    `,
    date,
  );
  const habitsCompleted = habitCounts?.completed ?? 0;

  return {
    habitsCompleted,
    habitsIncomplete: (habitCounts?.total ?? 0) - habitsCompleted,
  };
}
