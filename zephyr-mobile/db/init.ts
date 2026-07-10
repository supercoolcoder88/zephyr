import * as SQLite from "expo-sqlite";

import { rolloverDailyReview } from "./dailyReview";

export const DATABASE_NAME = "zephyr.db";

async function addColumnIfMissing(
  database: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  definition: string,
) {
  const columns = await database.getAllAsync<{ name: string }>(
    `PRAGMA table_info(${table})`,
  );

  if (!columns.some((existingColumn) => existingColumn.name === column)) {
    await database.execAsync(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

export async function initDatabase(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS habit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS habit_log (
      habit_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('INCOMPLETE', 'COMPLETE')),
      PRIMARY KEY (habit_id, date),
      FOREIGN KEY (habit_id) REFERENCES habit (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      deadline TEXT
    );

    CREATE TABLE IF NOT EXISTS tag (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_tag (
      taskId INTEGER NOT NULL,
      tagId INTEGER NOT NULL,
      PRIMARY KEY (taskId, tagId),
      FOREIGN KEY (taskId) REFERENCES task (id) ON DELETE CASCADE,
      FOREIGN KEY (tagId) REFERENCES tag (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_log (
      task_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('INCOMPLETE', 'INPROGRESS', 'COMPLETE')),
      PRIMARY KEY (task_id, date),
      FOREIGN KEY (task_id) REFERENCES task (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS daily_review (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      habits_completed INTEGER NOT NULL DEFAULT 0,
      habits_incomplete INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tracker (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracker_log (
      tracker_id INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      daily_review_id INTEGER NOT NULL,
      PRIMARY KEY (tracker_id, date),
      FOREIGN KEY (tracker_id) REFERENCES tracker (id) ON DELETE CASCADE,
      FOREIGN KEY (daily_review_id) REFERENCES daily_review (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_setting (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  await addColumnIfMissing(database, "task", "description", "description TEXT");
  await recreateHabitIfNeeded(database);
  await recreateDailyReviewIfNeeded(database);
  await createTrackerTables(database);
  await rolloverDailyReview(database);
}

async function recreateHabitIfNeeded(database: SQLite.SQLiteDatabase) {
  const columns = await database.getAllAsync<{ name: string }>(
    "PRAGMA table_info(habit)",
  );
  const columnNames = columns.map((column) => column.name);

  if (!columnNames.includes("score")) {
    return;
  }

  await database.execAsync(`
    PRAGMA foreign_keys = OFF;

    CREATE TABLE habit_next (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL
    );

    INSERT INTO habit_next (id, title)
    SELECT id, title
    FROM habit;

    DROP TABLE habit;
    ALTER TABLE habit_next RENAME TO habit;

    PRAGMA foreign_keys = ON;
  `);
}

async function recreateDailyReviewIfNeeded(database: SQLite.SQLiteDatabase) {
  const columns = await database.getAllAsync<{ name: string }>(
    "PRAGMA table_info(daily_review)",
  );
  const columnNames = columns.map((column) => column.name);
  const hasRequestedShape = ["habits_completed", "habits_incomplete"].every(
    (column) => columnNames.includes(column),
  );
  const hasRemovedTaskColumns =
    columnNames.includes("tasks_completed") ||
    columnNames.includes("tasks_incomplete");
  const hasRemovedHabitScoreColumn = columnNames.includes("habits_score");

  if (
    hasRequestedShape &&
    !hasRemovedTaskColumns &&
    !hasRemovedHabitScoreColumn
  ) {
    return;
  }

  if (!hasRequestedShape) {
    await database.execAsync(`
      DROP TABLE IF EXISTS tracker_log;
      DROP TABLE IF EXISTS daily_review;

      CREATE TABLE daily_review (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL UNIQUE,
        habits_completed INTEGER NOT NULL DEFAULT 0,
        habits_incomplete INTEGER NOT NULL DEFAULT 0
      );
    `);
    return;
  }

  await database.execAsync(`
    PRAGMA foreign_keys = OFF;

    CREATE TABLE daily_review_next (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      habits_completed INTEGER NOT NULL DEFAULT 0,
      habits_incomplete INTEGER NOT NULL DEFAULT 0
    );

    INSERT INTO daily_review_next (
      id,
      date,
      habits_completed,
      habits_incomplete
    )
    SELECT
      id,
      date,
      COALESCE(habits_completed, 0),
      COALESCE(habits_incomplete, 0)
    FROM daily_review;

    DROP TABLE daily_review;
    ALTER TABLE daily_review_next RENAME TO daily_review;

    PRAGMA foreign_keys = ON;
  `);
}

async function createTrackerTables(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS tracker (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracker_log (
      tracker_id INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      daily_review_id INTEGER NOT NULL,
      PRIMARY KEY (tracker_id, date),
      FOREIGN KEY (tracker_id) REFERENCES tracker (id) ON DELETE CASCADE,
      FOREIGN KEY (daily_review_id) REFERENCES daily_review (id) ON DELETE CASCADE
    );
  `);
}
