import { expect, mock, test } from "bun:test";

import { rolloverDailyReview } from "./dailyReview";

test("finalizes yesterday and creates today when the latest review is older", async () => {
  const runAsync = mock(() => Promise.resolve({}));
  const getFirstAsync = mock((sql, date) => {
    if (sql.includes("ORDER BY date DESC")) {
      return Promise.resolve({ date: "2026-07-08" });
    }
    if (sql.includes("COUNT(habit.id)")) {
      return Promise.resolve(
        date === "2026-07-09"
          ? { completed: 2, total: 3 }
          : { completed: 0, total: 3 },
      );
    }

    return Promise.resolve({
      date,
      habitsCompleted: 0,
      habitsIncomplete: 0,
      id: date === "2026-07-09" ? 1 : 2,
    });
  });
  const withTransactionAsync = mock((operation) => operation());

  await rolloverDailyReview(
    { getFirstAsync, runAsync, withTransactionAsync },
    new Date(2026, 6, 10, 12),
  );

  expect(withTransactionAsync).toHaveBeenCalledTimes(1);
  const summaryWrites = runAsync.mock.calls
    .filter(([sql]) => sql.includes("habits_completed = excluded"))
    .map(([, ...values]) => values);
  expect(summaryWrites).toEqual([
    ["2026-07-09", 2, 1],
    ["2026-07-10", 0, 3],
  ]);
});

test("does nothing when today's review already exists", async () => {
  const database = {
    getFirstAsync: mock(() => Promise.resolve({ date: "2026-07-10" })),
    withTransactionAsync: mock((operation) => operation()),
  };

  await rolloverDailyReview(database, new Date(2026, 6, 10, 12));

  expect(database.withTransactionAsync).not.toHaveBeenCalled();
});
