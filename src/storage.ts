export function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

export const write = (key: string, value: unknown) =>
  localStorage.setItem(key, JSON.stringify(value));
