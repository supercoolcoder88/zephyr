import { expect, mock, test } from "bun:test";

import { getHabitStreak } from "./habit";
import {
  getHabitCompletionBreakdown,
  getHabitCompletionHistory,
} from "./habitReview";

test("keeps a streak active through the current day", () => {
  expect(
    getHabitStreak(["2026-07-14", "2026-07-15", "2026-07-16"], "2026-07-17"),
  ).toBe(3);
  expect(getHabitStreak(["2026-07-16", "2026-07-17"], "2026-07-17")).toBe(2);
  expect(getHabitStreak(["2026-07-15"], "2026-07-17")).toBe(0);
});

test("groups completion dates by habit", async () => {
  const database = {
    getAllAsync: mock(() =>
      Promise.resolve([
        { id: 1, title: "Read", date: "2026-07-16" },
        { id: 1, title: "Read", date: "2026-07-17" },
        { id: 2, title: "Walk", date: null },
      ]),
    ),
  };

  const habits = await getHabitCompletionBreakdown(database, "2026-07-17", 7);

  expect(habits).toEqual([
    {
      id: 1,
      title: "Read",
      completedDates: ["2026-07-16", "2026-07-17"],
    },
    { id: 2, title: "Walk", completedDates: [] },
  ]);
  expect(database.getAllAsync.mock.calls[0].slice(1)).toEqual([
    "2026-07-11",
    "2026-07-17",
  ]);
});

test("fills missing completion days with zero", async () => {
  const database = {
    getAllAsync: mock(() =>
      Promise.resolve([
        { date: "2026-07-15", completed: 2 },
        { date: "2026-07-17", completed: 1 },
      ]),
    ),
  };

  const history = await getHabitCompletionHistory(database, "2026-07-17", 3);

  expect(history).toEqual([
    { date: "2026-07-15", completed: 2 },
    { date: "2026-07-16", completed: 0 },
    { date: "2026-07-17", completed: 1 },
  ]);
  expect(database.getAllAsync.mock.calls[0].slice(1)).toEqual([
    "2026-07-15",
    "2026-07-17",
  ]);
});
