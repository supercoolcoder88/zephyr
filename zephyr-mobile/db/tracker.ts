import type { SQLiteDatabase } from "expo-sqlite";

import { getOrCreateDailyReviewByDate } from "./dailyReview";

export type Tracker = {
  id: number;
  name: string;
};

export type TrackerWithLog = Tracker & {
  count: number;
  date: string | null;
  dailyReviewId: number | null;
};

export type CreateTrackerInput = {
  name: string;
};

export type UpdateTrackerInput = Partial<Omit<Tracker, "id">>;

type TrackerWithLogRow = TrackerWithLog;

export async function createTracker(
  database: SQLiteDatabase,
  input: CreateTrackerInput,
): Promise<Tracker> {
  const result = await database.runAsync(
    "INSERT INTO tracker (name) VALUES (?)",
    input.name,
  );

  return {
    id: result.lastInsertRowId,
    name: input.name,
  };
}

export function getTracker(
  database: SQLiteDatabase,
  id: number,
): Promise<Tracker | null> {
  return database.getFirstAsync<Tracker>(
    "SELECT id, name FROM tracker WHERE id = ?",
    id,
  );
}

export function getAllTrackers(database: SQLiteDatabase): Promise<Tracker[]> {
  return database.getAllAsync<Tracker>(
    "SELECT id, name FROM tracker ORDER BY id",
  );
}

export function getTrackersWithLog(
  database: SQLiteDatabase,
  date: string,
): Promise<TrackerWithLog[]> {
  return database.getAllAsync<TrackerWithLogRow>(
    `
      SELECT
        tracker.id,
        tracker.name,
        COALESCE(tracker_log.count, 0) AS count,
        tracker_log.date,
        tracker_log.daily_review_id AS dailyReviewId
      FROM tracker
      LEFT JOIN tracker_log
        ON tracker_log.tracker_id = tracker.id
        AND tracker_log.date = ?
      ORDER BY tracker.id
    `,
    date,
  );
}

export async function updateTracker(
  database: SQLiteDatabase,
  id: number,
  input: UpdateTrackerInput,
): Promise<Tracker | null> {
  if (input.name !== undefined) {
    await database.runAsync(
      "UPDATE tracker SET name = ? WHERE id = ?",
      input.name,
      id,
    );
  }

  return getTracker(database, id);
}

export async function deleteTracker(
  database: SQLiteDatabase,
  id: number,
): Promise<void> {
  await database.runAsync("DELETE FROM tracker WHERE id = ?", id);
}

export async function upsertTrackerLogCount(
  database: SQLiteDatabase,
  trackerId: number,
  date: string,
  count: number,
): Promise<TrackerWithLog | null> {
  const review = await getOrCreateDailyReviewByDate(database, date);

  await database.runAsync(
    `
      INSERT INTO tracker_log (
        tracker_id,
        count,
        date,
        daily_review_id
      )
      VALUES (?, ?, ?, ?)
      ON CONFLICT(tracker_id, date) DO UPDATE SET
        count = excluded.count,
        daily_review_id = excluded.daily_review_id
    `,
    trackerId,
    count,
    date,
    review.id,
  );

  return getTrackerWithLog(database, trackerId, date);
}

export function getTrackerWithLog(
  database: SQLiteDatabase,
  trackerId: number,
  date: string,
): Promise<TrackerWithLog | null> {
  return database.getFirstAsync<TrackerWithLogRow>(
    `
      SELECT
        tracker.id,
        tracker.name,
        COALESCE(tracker_log.count, 0) AS count,
        tracker_log.date,
        tracker_log.daily_review_id AS dailyReviewId
      FROM tracker
      LEFT JOIN tracker_log
        ON tracker_log.tracker_id = tracker.id
        AND tracker_log.date = ?
      WHERE tracker.id = ?
    `,
    date,
    trackerId,
  );
}
