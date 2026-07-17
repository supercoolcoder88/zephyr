const TAG_PATTERN = /(?:^|[\s(])[@#]([A-Za-z0-9][A-Za-z0-9_-]*)/g;
const FOLDER_PATTERN = /(?:^|[\s(])\/([A-Za-z0-9][A-Za-z0-9_-]*)/g;
const PRIORITY_PATTERN = /(?:^|[\s(])!([1-3])/g;

export const priorityByCommand = {
  "1": "LOW",
  "2": "MEDIUM",
  "3": "HIGH",
} as const;

export function parseTaskTitleCommands(title: string) {
  const tags = extractTaskTags(title);
  const folderMatches = [...title.matchAll(FOLDER_PATTERN)];
  const priorityMatches = [...title.matchAll(PRIORITY_PATTERN)];
  const folderToken = folderMatches.at(-1)?.[1]?.toLowerCase() ?? null;
  const priorityCommand = priorityMatches.at(-1)?.[1] as
    keyof typeof priorityByCommand | undefined;

  return {
    folderToken,
    priority: priorityCommand ? priorityByCommand[priorityCommand] : null,
    priorityCommand: priorityCommand ?? null,
    tags,
  };
}

export function extractTaskTags(title: string) {
  const tags = new Set<string>();

  for (const match of title.matchAll(TAG_PATTERN)) {
    const tag = match[1]?.toLowerCase();

    if (tag) {
      tags.add(tag);
    }
  }

  return [...tags];
}

export function getTaskDisplayTitle(title: string) {
  const displayTitle = [TAG_PATTERN, FOLDER_PATTERN, PRIORITY_PATTERN]
    .reduce(
      (currentTitle, pattern) =>
        currentTitle.replace(pattern, (match, _value, offset) =>
          offset === 0 ? "" : match.charAt(0),
        ),
      title,
    )
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/\\\//g, "/");

  return displayTitle || title;
}

export function getFolderCommand(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function removeFolderCommand(title: string) {
  return removeCommand(title, FOLDER_PATTERN);
}

export function removePriorityCommand(title: string) {
  return removeCommand(title, PRIORITY_PATTERN);
}

function removeCommand(title: string, pattern: RegExp) {
  return title
    .replace(pattern, (match, _value, offset) =>
      offset === 0 ? "" : match.charAt(0),
    )
    .replace(/\s{2,}/g, " ")
    .trimEnd();
}
