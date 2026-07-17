export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);

  return getLocalDateKey(date);
}

export function formatDateKeyForDisplay(dateKey: string) {
  const [year, month, day] = dateKey.split("-");

  if (!year || !month || !day) {
    return dateKey;
  }

  return `${day}/${month}/${year}`;
}
