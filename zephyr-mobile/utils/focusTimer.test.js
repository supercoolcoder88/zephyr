import { expect, test } from "bun:test";

import {
  FOCUS_DURATION_SECONDS,
  FOCUS_STEP_SECONDS,
  formatTimer,
} from "./focusTimer";

test("formats the default focus duration", () => {
  expect(FOCUS_DURATION_SECONDS).toBe(1800);
  expect(FOCUS_STEP_SECONDS).toBe(300);
  expect(formatTimer(FOCUS_DURATION_SECONDS)).toBe("30:00");
});

test("pads timer values", () => {
  expect(formatTimer(65)).toBe("01:05");
  expect(formatTimer(0)).toBe("00:00");
});
