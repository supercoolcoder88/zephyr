import { expect, mock, test } from "bun:test";

import { getDisableEdits, setDisableEdits } from "./settings";

test("reads enabled boolean settings", async () => {
  const database = {
    getFirstAsync: mock(() => Promise.resolve({ value: "1" })),
  };

  expect(await getDisableEdits(database)).toBe(true);
});

test("persists edit settings", async () => {
  const database = { runAsync: mock(() => Promise.resolve()) };

  await setDisableEdits(database, false);

  expect(database.runAsync.mock.calls[0].slice(1)).toEqual([
    "disable_edits",
    "0",
  ]);
});
