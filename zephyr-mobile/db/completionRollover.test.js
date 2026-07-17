import { expect, mock, test } from "bun:test";

import { updateHabitLogStatus } from "./habitLog";
import { getTasksWithCompletion } from "./task";
import { updateTaskLogStatus } from "./taskLog";

test("tasks keep the latest completion state across days", async () => {
  const database = {
    getFirstAsync: mock(() =>
      Promise.resolve({
        taskId: 1,
        date: "2026-07-15",
        status: "COMPLETE",
      }),
    ),
    runAsync: mock(() => Promise.resolve()),
  };

  const result = await updateTaskLogStatus(database, 1, "2026-07-16");

  expect(result.status).toBe("INCOMPLETE");
  expect(database.runAsync.mock.calls[0].slice(1)).toEqual([
    1,
    "2026-07-16",
    "INCOMPLETE",
  ]);
});

test("task lists use the latest log instead of today's log", async () => {
  const database = { getAllAsync: mock(() => Promise.resolve([])) };

  await getTasksWithCompletion(database);

  expect(database.getAllAsync.mock.calls[0]).toHaveLength(1);
  expect(database.getAllAsync.mock.calls[0][0]).toContain(
    "MAX(latest_task_log.date)",
  );
});

test("habits still start incomplete on a new day", async () => {
  const database = {
    getFirstAsync: mock(() => Promise.resolve(null)),
    runAsync: mock(() => Promise.resolve()),
  };

  const result = await updateHabitLogStatus(database, 1, "2026-07-16");

  expect(result.status).toBe("COMPLETE");
  expect(database.getFirstAsync.mock.calls[0].slice(1)).toEqual([
    1,
    "2026-07-16",
  ]);
});
