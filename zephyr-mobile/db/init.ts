import * as SQLite from "expo-sqlite";

export const DATABASE_NAME = "zephyr.db";

export async function initDatabase(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS habit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 1
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
      sleep_score INTEGER NOT NULL DEFAULT 0,
      energy_score INTEGER NOT NULL DEFAULT 0,
      day_score INTEGER NOT NULL DEFAULT 0,
      screen_time INTEGER NOT NULL DEFAULT 0
    );
  `);
}
