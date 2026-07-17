import { expect, mock, test } from "bun:test";

import { createTask } from "./task";

test("creates a task from title commands and links its tags", async () => {
  const runAsync = mock((sql) =>
    Promise.resolve({
      lastInsertRowId: sql.includes("INSERT INTO task (") ? 7 : 0,
    }),
  );
  const database = {
    getFirstAsync: mock(() =>
      Promise.resolve({
        id: 7,
        title: "Prepare brief #Client @writing #client /client-work !3",
        description: null,
        deadline: null,
        priority: "HIGH",
        scheduledDate: null,
        folderId: 3,
        folderName: "client-work",
        tags: `client${String.fromCharCode(31)}writing`,
      }),
    ),
    runAsync,
    withTransactionAsync: mock((operation) => operation()),
  };

  const task = await createTask(database, {
    title: "Prepare brief #Client @writing #client /client-work !3",
  });

  const createdMetadata = runAsync.mock.calls
    .filter(([sql]) => sql.includes("INSERT INTO tag"))
    .map(([, title, kind]) => [title, kind]);
  const linkedMetadata = runAsync.mock.calls
    .filter(([sql]) => sql.includes("INSERT OR IGNORE INTO task_tag"))
    .map(([, taskId, title, kind]) => [taskId, title, kind]);

  expect(createdMetadata).toEqual([
    ["client", "TAG"],
    ["writing", "TAG"],
    ["client-work", "FOLDER"],
  ]);
  expect(linkedMetadata).toEqual([
    [7, "client", "TAG"],
    [7, "writing", "TAG"],
    [7, "client-work", "FOLDER"],
  ]);
  const taskInsert = runAsync.mock.calls.find(([sql]) =>
    sql.includes("INSERT INTO task ("),
  );
  expect(taskInsert?.slice(1)).toEqual([
    "Prepare brief #Client @writing #client /client-work !3",
    null,
    null,
    "HIGH",
    null,
  ]);
  expect(task.folderName).toBe("client-work");
  expect(task.tags).toEqual(["client", "writing"]);
});
