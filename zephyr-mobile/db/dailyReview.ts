import type { SQLiteDatabase } from "expo-sqlite";

export type DailyReview = {
  id: number;
  date: string;
  habitsCompleted: number;
  habitsIncomplete: number;
  habitsScore: number;
  tasksCompleted: number;
  tasksIncomplete: number;
};

type DailyReviewRow = {
  id: number;
  date: string;
  habitsCompleted: number;
  habitsIncomplete: number;
  habitsScore: number;
  tasksCompleted: number;
  tasksIncomplete: number;
};

type DailyReviewCounts = Omit<DailyReview, "id" | "date">;

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
        habits_incomplete,
        habits_score,
        tasks_completed,
        tasks_incomplete
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        habits_completed = excluded.habits_completed,
        habits_incomplete = excluded.habits_incomplete,
        habits_score = excluded.habits_score,
        tasks_completed = excluded.tasks_completed,
        tasks_incomplete = excluded.tasks_incomplete
    `,
    date,
    counts.habitsCompleted,
    counts.habitsIncomplete,
    counts.habitsScore,
    counts.tasksCompleted,
    counts.tasksIncomplete,
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
        habits_incomplete AS habitsIncomplete,
        habits_score AS habitsScore,
        tasks_completed AS tasksCompleted,
        tasks_incomplete AS tasksIncomplete
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
      habits_incomplete AS habitsIncomplete,
      habits_score AS habitsScore,
      tasks_completed AS tasksCompleted,
      tasks_incomplete AS tasksIncomplete
    FROM daily_review
    ORDER BY date
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
    score: number | null;
  }>(
    `
      SELECT
        COUNT(habit.id) AS total,
        COUNT(CASE WHEN habit_log.status = 'COMPLETE' THEN 1 END) AS completed,
        SUM(CASE WHEN habit_log.status = 'COMPLETE' THEN habit.score ELSE 0 END) AS score
      FROM habit
      LEFT JOIN habit_log
        ON habit_log.habit_id = habit.id
        AND habit_log.date = ?
    `,
    date,
  );
  const taskCounts = await database.getFirstAsync<{
    completed: number;
    total: number;
  }>(
    `
      SELECT
        COUNT(task.id) AS total,
        COUNT(CASE WHEN task_log.status = 'COMPLETE' THEN 1 END) AS completed
      FROM task
      LEFT JOIN task_log
        ON task_log.task_id = task.id
        AND task_log.date = ?
    `,
    date,
  );

  const habitsCompleted = habitCounts?.completed ?? 0;
  const tasksCompleted = taskCounts?.completed ?? 0;

  return {
    habitsCompleted,
    habitsIncomplete: (habitCounts?.total ?? 0) - habitsCompleted,
    habitsScore: habitCounts?.score ?? 0,
    tasksCompleted,
    tasksIncomplete: (taskCounts?.total ?? 0) - tasksCompleted,
  };
}
