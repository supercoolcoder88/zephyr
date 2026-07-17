import type { SQLiteDatabase } from "expo-sqlite";

import { extractTaskTags, parseTaskTitleCommands } from "../utils/taskTags";

export type TaskPriority = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export type Task = {
  id: number;
  title: string;
  description: string | null;
  deadline: string | null;
  priority: TaskPriority;
  scheduledDate: string | null;
  folderId: number | null;
  folderName: string | null;
  tags: string[];
};

export type TaskWithCompletion = Task & {
  status: "INCOMPLETE" | "INPROGRESS" | "COMPLETE";
  statusDate: string | null;
};

export type CreateTaskInput = {
  title: string;
  description?: string | null;
  deadline?: string | null;
  priority?: TaskPriority;
  scheduledDate?: string | null;
  folderName?: string | null;
};

export type UpdateTaskInput = Partial<CreateTaskInput>;

type TaskRow = Omit<Task, "tags"> & { tags: string };
type TaskWithCompletionRow = Omit<TaskWithCompletion, "tags"> & {
  tags: string;
};

const TASK_SELECT = `
  SELECT
    task.id,
    task.title,
    task.description,
    task.deadline,
    task.priority,
    task.scheduled_date AS scheduledDate,
    (
      SELECT tag.id
      FROM task_tag
      JOIN tag ON tag.id = task_tag.tagId
      WHERE task_tag.taskId = task.id AND tag.kind = 'FOLDER'
      LIMIT 1
    ) AS folderId,
    (
      SELECT tag.title
      FROM task_tag
      JOIN tag ON tag.id = task_tag.tagId
      WHERE task_tag.taskId = task.id AND tag.kind = 'FOLDER'
      LIMIT 1
    ) AS folderName,
    COALESCE((
      SELECT GROUP_CONCAT(tag.title, CHAR(31))
      FROM task_tag
      JOIN tag ON tag.id = task_tag.tagId
      WHERE task_tag.taskId = task.id AND tag.kind = 'TAG'
    ), '') AS tags
  FROM task
`;

export async function createTask(
  database: SQLiteDatabase,
  input: CreateTaskInput,
): Promise<Task> {
  let taskId = 0;

  await database.withTransactionAsync(async () => {
    const commands = parseTaskTitleCommands(input.title);
    const result = await database.runAsync(
      `INSERT INTO task (
        title,
        description,
        deadline,
        priority,
        scheduled_date
      ) VALUES (?, ?, ?, ?, ?)`,
      input.title,
      input.description ?? null,
      input.deadline ?? null,
      input.priority ?? commands.priority ?? "NONE",
      input.scheduledDate ?? null,
    );
    taskId = result.lastInsertRowId;
    await syncTaskMetadata(database, taskId, input.title, input.folderName);
  });

  const task = await getTask(database, taskId);

  if (!task) {
    throw new Error("Unable to create task.");
  }

  return task;
}

export async function getTask(
  database: SQLiteDatabase,
  id: number,
): Promise<Task | null> {
  const row = await database.getFirstAsync<TaskRow>(
    `${TASK_SELECT} WHERE task.id = ?`,
    id,
  );

  return row ? mapTaskRow(row) : null;
}

export async function getTasksWithCompletion(
  database: SQLiteDatabase,
): Promise<TaskWithCompletion[]> {
  const rows = await database.getAllAsync<TaskWithCompletionRow>(`
    SELECT
      task.id,
      task.title,
      task.description,
      task.deadline,
      task.priority,
      task.scheduled_date AS scheduledDate,
      (
        SELECT tag.id
        FROM task_tag
        JOIN tag ON tag.id = task_tag.tagId
        WHERE task_tag.taskId = task.id AND tag.kind = 'FOLDER'
        LIMIT 1
      ) AS folderId,
      (
        SELECT tag.title
        FROM task_tag
        JOIN tag ON tag.id = task_tag.tagId
        WHERE task_tag.taskId = task.id AND tag.kind = 'FOLDER'
        LIMIT 1
      ) AS folderName,
      COALESCE((
        SELECT GROUP_CONCAT(tag.title, CHAR(31))
        FROM task_tag
        JOIN tag ON tag.id = task_tag.tagId
        WHERE task_tag.taskId = task.id AND tag.kind = 'TAG'
      ), '') AS tags,
      COALESCE(task_log.status, 'INCOMPLETE') AS status,
      task_log.date AS statusDate
    FROM task
    LEFT JOIN task_log
      ON task_log.task_id = task.id
      AND task_log.date = (
        SELECT MAX(latest_task_log.date)
        FROM task_log AS latest_task_log
        WHERE latest_task_log.task_id = task.id
      )
    ORDER BY
      CASE COALESCE(task_log.status, 'INCOMPLETE')
        WHEN 'COMPLETE' THEN 1
        ELSE 0
      END,
      CASE task.priority
        WHEN 'HIGH' THEN 0
        WHEN 'MEDIUM' THEN 1
        WHEN 'LOW' THEN 2
        ELSE 3
      END,
      CASE WHEN task.deadline IS NULL THEN 1 ELSE 0 END,
      task.deadline,
      task.id
  `);

  return rows.map(mapTaskRow);
}

export async function updateTask(
  database: SQLiteDatabase,
  id: number,
  input: UpdateTaskInput,
): Promise<Task | null> {
  await database.withTransactionAsync(async () => {
    const commands = input.title
      ? parseTaskTitleCommands(input.title)
      : undefined;
    const updates: string[] = [];
    const params: Array<string | number | null> = [];

    if (input.title !== undefined) {
      updates.push("title = ?");
      params.push(input.title);
    }

    if (input.description !== undefined) {
      updates.push("description = ?");
      params.push(input.description);
    }

    if (input.deadline !== undefined) {
      updates.push("deadline = ?");
      params.push(input.deadline);
    }

    if (input.priority !== undefined) {
      updates.push("priority = ?");
      params.push(input.priority);
    } else if (commands?.priority) {
      updates.push("priority = ?");
      params.push(commands.priority);
    }

    if (input.scheduledDate !== undefined) {
      updates.push("scheduled_date = ?");
      params.push(input.scheduledDate);
    }

    if (updates.length > 0) {
      await database.runAsync(
        `UPDATE task SET ${updates.join(", ")} WHERE id = ?`,
        [...params, id],
      );
    }

    if (input.title !== undefined) {
      await syncTaskMetadata(database, id, input.title, input.folderName);
    }
  });

  return getTask(database, id);
}

export async function deleteTask(
  database: SQLiteDatabase,
  id: number,
): Promise<void> {
  await database.withTransactionAsync(async () => {
    await database.runAsync("DELETE FROM task WHERE id = ?", id);
    await deleteUnusedTags(database);
  });
}

async function syncTaskMetadata(
  database: SQLiteDatabase,
  taskId: number,
  title: string,
  folderName?: string | null,
) {
  await database.runAsync("DELETE FROM task_tag WHERE taskId = ?", taskId);

  for (const tagName of extractTaskTags(title)) {
    await linkTaskMetadata(database, taskId, tagName, "TAG");
  }

  const folder = parseTaskTitleCommands(title).folderToken ?? folderName;

  if (folder) {
    await linkTaskMetadata(database, taskId, folder, "FOLDER");
  }

  await deleteUnusedTags(database);
}

async function linkTaskMetadata(
  database: SQLiteDatabase,
  taskId: number,
  title: string,
  kind: "TAG" | "FOLDER",
) {
  await database.runAsync(
    `INSERT INTO tag (title, kind)
     SELECT ?, ?
     WHERE NOT EXISTS (
       SELECT 1
       FROM tag
       WHERE title = ? COLLATE NOCASE AND kind = ?
     )`,
    title,
    kind,
    title,
    kind,
  );
  await database.runAsync(
    `INSERT OR IGNORE INTO task_tag (taskId, tagId)
     SELECT ?, id
     FROM tag
     WHERE title = ? COLLATE NOCASE AND kind = ?`,
    taskId,
    title,
    kind,
  );
}

function deleteUnusedTags(database: SQLiteDatabase) {
  return database.runAsync(`
    DELETE FROM tag
    WHERE NOT EXISTS (
      SELECT 1 FROM task_tag WHERE task_tag.tagId = tag.id
    )
  `);
}

function mapTaskRow<T extends TaskRow | TaskWithCompletionRow>(row: T) {
  return {
    ...row,
    tags: row.tags
      ? row.tags
          .split(String.fromCharCode(31))
          .sort((left, right) => left.localeCompare(right))
      : [],
  };
}
