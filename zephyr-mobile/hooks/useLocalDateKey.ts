import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { getLocalDateKey } from "../utils/date";

export function useLocalDateKey() {
  const [dateKey, setDateKey] = useState(getLocalDateKey);

  useEffect(() => {
    const now = new Date();
    const nextDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      1,
    );
    const timeout = setTimeout(
      () => setDateKey(getLocalDateKey()),
      nextDay.getTime() - now.getTime(),
    );
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        setDateKey(getLocalDateKey());
      }
    });

    return () => {
      clearTimeout(timeout);
      subscription.remove();
    };
  }, [dateKey]);

  return dateKey;
}
