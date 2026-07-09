import type { SQLiteDatabase } from "expo-sqlite";

export type DailyReview = {
  id: number;
  date: string;
  sleepScore: number;
  energyScore: number;
  dayScore: number;
  screenTime: number;
};

export type CreateDailyReviewInput = {
  date: string;
  sleepScore?: number;
  energyScore?: number;
  dayScore?: number;
  screenTime?: number;
};

export type UpdateDailyReviewInput = Partial<Omit<DailyReview, "id">>;

type DailyReviewRow = {
  id: number;
  date: string;
  sleepScore: number;
  energyScore: number;
  dayScore: number;
  screenTime: number;
};

export async function createDailyReview(
  database: SQLiteDatabase,
  input: CreateDailyReviewInput,
): Promise<DailyReview> {
  const review = {
    date: input.date,
    sleepScore: input.sleepScore ?? 0,
    energyScore: input.energyScore ?? 0,
    dayScore: input.dayScore ?? 0,
    screenTime: input.screenTime ?? 0,
  };

  const result = await database.runAsync(
    `
      INSERT INTO daily_review (
        date,
        sleep_score,
        energy_score,
        day_score,
        screen_time
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    review.date,
    review.sleepScore,
    review.energyScore,
    review.dayScore,
    review.screenTime,
  );

  return {
    id: result.lastInsertRowId,
    ...review,
  };
}

export function getDailyReview(
  database: SQLiteDatabase,
  id: number,
): Promise<DailyReview | null> {
  return database.getFirstAsync<DailyReviewRow>(
    `
      SELECT
        id,
        date,
        sleep_score AS sleepScore,
        energy_score AS energyScore,
        day_score AS dayScore,
        screen_time AS screenTime
      FROM daily_review
      WHERE id = ?
    `,
    id,
  );
}

export function getAllDailyReviews(
  database: SQLiteDatabase,
): Promise<DailyReview[]> {
  return database.getAllAsync<DailyReviewRow>(`
    SELECT
      id,
      date,
      sleep_score AS sleepScore,
      energy_score AS energyScore,
      day_score AS dayScore,
      screen_time AS screenTime
    FROM daily_review
    ORDER BY date
  `);
}

export async function updateDailyReview(
  database: SQLiteDatabase,
  id: number,
  input: UpdateDailyReviewInput,
): Promise<DailyReview | null> {
  const updates: string[] = [];
  const params: Array<string | number> = [];

  if (input.date !== undefined) {
    updates.push("date = ?");
    params.push(input.date);
  }

  if (input.sleepScore !== undefined) {
    updates.push("sleep_score = ?");
    params.push(input.sleepScore);
  }

  if (input.energyScore !== undefined) {
    updates.push("energy_score = ?");
    params.push(input.energyScore);
  }

  if (input.dayScore !== undefined) {
    updates.push("day_score = ?");
    params.push(input.dayScore);
  }

  if (input.screenTime !== undefined) {
    updates.push("screen_time = ?");
    params.push(input.screenTime);
  }

  if (updates.length > 0) {
    await database.runAsync(
      `UPDATE daily_review SET ${updates.join(", ")} WHERE id = ?`,
      [...params, id],
    );
  }

  return getDailyReview(database, id);
}

export async function deleteDailyReview(
  database: SQLiteDatabase,
  id: number,
): Promise<void> {
  await database.runAsync("DELETE FROM daily_review WHERE id = ?", id);
}
