import * as SQLite from "expo-sqlite";

import { getFolderCommand } from "../utils/taskTags";

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
      deadline TEXT,
      priority TEXT NOT NULL DEFAULT 'NONE'
        CHECK (priority IN ('NONE', 'LOW', 'MEDIUM', 'HIGH')),
      scheduled_date TEXT
    );

    CREATE TABLE IF NOT EXISTS tag (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'TAG'
        CHECK (kind IN ('TAG', 'FOLDER'))
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

    CREATE TABLE IF NOT EXISTS app_setting (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  await addColumnIfMissing(database, "task", "description", "description TEXT");
  await addColumnIfMissing(database, "task", "deadline", "deadline TEXT");
  await addColumnIfMissing(
    database,
    "task",
    "priority",
    "priority TEXT NOT NULL DEFAULT 'NONE' CHECK (priority IN ('NONE', 'LOW', 'MEDIUM', 'HIGH'))",
  );
  await addColumnIfMissing(
    database,
    "task",
    "scheduled_date",
    "scheduled_date TEXT",
  );
  await addColumnIfMissing(
    database,
    "tag",
    "kind",
    "kind TEXT NOT NULL DEFAULT 'TAG' CHECK (kind IN ('TAG', 'FOLDER'))",
  );
  await migrateFoldersToTags(database);
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS task_scheduled_date_index
      ON task (scheduled_date);
    CREATE INDEX IF NOT EXISTS task_deadline_index
      ON task (deadline);
    CREATE INDEX IF NOT EXISTS task_log_task_date_index
      ON task_log (task_id, date DESC);
    CREATE INDEX IF NOT EXISTS tag_kind_title_index
      ON tag (kind, title COLLATE NOCASE);
  `);
  await recreateHabitIfNeeded(database);
}

async function migrateFoldersToTags(database: SQLite.SQLiteDatabase) {
  const folderTable = await database.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'folder'",
  );
  const taskColumns = await database.getAllAsync<{ name: string }>(
    "PRAGMA table_info(task)",
  );

  if (
    !folderTable ||
    !taskColumns.some((column) => column.name === "folder_id")
  ) {
    return;
  }

  await database.execAsync(`
    INSERT INTO tag (title, kind)
    SELECT DISTINCT folder.name, 'FOLDER'
    FROM task
    JOIN folder ON folder.id = task.folder_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM tag
      WHERE tag.kind = 'FOLDER'
        AND tag.title = folder.name COLLATE NOCASE
    );

    INSERT OR IGNORE INTO task_tag (taskId, tagId)
    SELECT task.id, tag.id
    FROM task
    JOIN folder ON folder.id = task.folder_id
    JOIN tag
      ON tag.kind = 'FOLDER'
      AND tag.title = folder.name COLLATE NOCASE;
  `);

  const legacyFolderTasks = await database.getAllAsync<{
    id: number;
    folderName: string;
    title: string;
  }>(`
    SELECT task.id, task.title, folder.name AS folderName
    FROM task
    JOIN folder ON folder.id = task.folder_id
  `);

  for (const task of legacyFolderTasks) {
    const command = getFolderCommand(task.folderName);
    const legacyCommand = new RegExp(
      `(^|[\\s(])@${command}(?=$|[\\s),.!?])`,
      "gi",
    );
    const migratedTitle = task.title.replace(legacyCommand, `$1/${command}`);

    if (migratedTitle !== task.title) {
      await database.runAsync(
        "UPDATE task SET title = ? WHERE id = ?",
        migratedTitle,
        task.id,
      );
    }
  }

  await database.execAsync("PRAGMA foreign_keys = OFF");
  try {
    await database.execAsync(`

    CREATE TABLE task_next (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      deadline TEXT,
      priority TEXT NOT NULL DEFAULT 'NONE'
        CHECK (priority IN ('NONE', 'LOW', 'MEDIUM', 'HIGH')),
      scheduled_date TEXT
    );

    INSERT INTO task_next (
      id,
      title,
      description,
      deadline,
      priority,
      scheduled_date
    )
    SELECT
      id,
      title,
      description,
      deadline,
      priority,
      scheduled_date
    FROM task;

    DROP TABLE task;
    ALTER TABLE task_next RENAME TO task;
    DROP TABLE folder;
  `);
  } finally {
    await database.execAsync("PRAGMA foreign_keys = ON");
  }
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
