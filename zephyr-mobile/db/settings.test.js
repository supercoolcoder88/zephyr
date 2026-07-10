import { expect, mock, test } from "bun:test";

import {
  getDisableEdits,
  getHideTrackerAddButton,
  setDisableEdits,
  setHideTrackerAddButton,
} from "./settings";

test("reads enabled boolean settings", async () => {
  const database = {
    getFirstAsync: mock(() => Promise.resolve({ value: "1" })),
  };

  expect(await getHideTrackerAddButton(database)).toBe(true);
  expect(await getDisableEdits(database)).toBe(true);
});

test("persists tracker and edit settings", async () => {
  const database = { runAsync: mock(() => Promise.resolve()) };

  await setHideTrackerAddButton(database, true);
  await setDisableEdits(database, false);

  expect(database.runAsync.mock.calls[0].slice(1)).toEqual([
    "hide_tracker_add_button",
    "1",
  ]);
  expect(database.runAsync.mock.calls[1].slice(1)).toEqual([
    "disable_edits",
    "0",
  ]);
});
