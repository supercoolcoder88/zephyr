export const FOCUS_DURATION_SECONDS = 30 * 60;
export const FOCUS_STEP_SECONDS = 5 * 60;

export function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}
