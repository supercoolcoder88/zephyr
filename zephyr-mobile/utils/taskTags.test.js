import { expect, test } from "bun:test";

import {
  extractTaskTags,
  getFolderCommand,
  getTaskDisplayTitle,
  parseTaskTitleCommands,
  removeFolderCommand,
  removePriorityCommand,
} from "./taskTags";

test("extracts unique normalized tags from a task title", () => {
  expect(
    extractTaskTags("Ship landing page #Client @design #client (#qa-ready)"),
  ).toEqual(["client", "design", "qa-ready"]);
});

test("parses folder and priority commands", () => {
  expect(
    parseTaskTitleCommands("Ship landing page #design /Client-Work !3"),
  ).toEqual({
    folderToken: "client-work",
    priority: "HIGH",
    priorityCommand: "3",
    tags: ["design"],
  });
});

test("makes three the most severe priority", () => {
  expect(parseTaskTitleCommands("Ship !1").priority).toBe("LOW");
  expect(parseTaskTitleCommands("Ship !3").priority).toBe("HIGH");
  expect(parseTaskTitleCommands("Ship !4").priority).toBeNull();
});

test("removes commands from the displayed title", () => {
  expect(getTaskDisplayTitle("Ship landing page #client /client-work !2")).toBe(
    "Ship landing page",
  );
});

test("allows a literal slash to be escaped", () => {
  expect(parseTaskTitleCommands(String.raw`Read \/docs #research`)).toEqual({
    folderToken: null,
    priority: null,
    priorityCommand: null,
    tags: ["research"],
  });
  expect(getTaskDisplayTitle(String.raw`Read \/docs #research`)).toBe(
    "Read /docs",
  );
});

test("normalizes and removes selected commands", () => {
  expect(getFolderCommand("Client Work")).toBe("client-work");
  expect(removeFolderCommand("Ship /client-work !1")).toBe("Ship !1");
  expect(removePriorityCommand("Ship /client-work !1")).toBe(
    "Ship /client-work",
  );
});
