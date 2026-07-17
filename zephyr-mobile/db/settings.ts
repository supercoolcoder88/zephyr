import type { SQLiteDatabase } from "expo-sqlite";

const HIDE_HABIT_ADD_BUTTON = "hide_habit_add_button";
const DISABLE_EDITS = "disable_edits";

async function getBooleanSetting(database: SQLiteDatabase, key: string) {
  const setting = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_setting WHERE key = ?",
    key,
  );

  return setting?.value === "1";
}

async function setBooleanSetting(
  database: SQLiteDatabase,
  key: string,
  hidden: boolean,
) {
  await database.runAsync(
    `INSERT INTO app_setting (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    hidden ? "1" : "0",
  );
}

export function getHideHabitAddButton(database: SQLiteDatabase) {
  return getBooleanSetting(database, HIDE_HABIT_ADD_BUTTON);
}

export function setHideHabitAddButton(
  database: SQLiteDatabase,
  hidden: boolean,
) {
  return setBooleanSetting(database, HIDE_HABIT_ADD_BUTTON, hidden);
}

export function getDisableEdits(database: SQLiteDatabase) {
  return getBooleanSetting(database, DISABLE_EDITS);
}

export function setDisableEdits(database: SQLiteDatabase, disabled: boolean) {
  return setBooleanSetting(database, DISABLE_EDITS, disabled);
}
