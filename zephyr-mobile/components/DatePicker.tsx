import { useEffect, useState } from "react";
import { Keyboard, Pressable, Text, View } from "react-native";

import { formatDateKeyForDisplay, getLocalDateKey } from "../utils/date";

type DatePickerProps = {
  onChange: (date: string | null) => void;
  value: string | null;
};

const weekdayLabels = ["M", "T", "W", "T", "F", "S", "S"];

export default function DatePicker({ onChange, value }: DatePickerProps) {
  const [expanded, setExpanded] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => toDate(value));
  const today = getLocalDateKey();

  useEffect(() => {
    setVisibleMonth(toDate(value));
  }, [value]);

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  return (
    <View className="rounded bg-neutral-100">
      <Pressable
        accessibilityLabel="Choose deadline"
        className="flex-row items-center justify-between px-3 py-3"
        onPress={() => {
          Keyboard.dismiss();
          setExpanded((current) => !current);
        }}
      >
        <Text
          className={value ? "font-semibold text-black" : "text-neutral-400"}
        >
          {value
            ? `Deadline · ${formatDateKeyForDisplay(value)}`
            : "Add deadline"}
        </Text>
        <Text className="font-semibold text-neutral-500">
          {expanded ? "−" : "+"}
        </Text>
      </Pressable>

      {expanded ? (
        <View className="border-t border-neutral-200 px-2 pb-3 pt-2">
          <View className="mb-2 flex-row items-center justify-between">
            <Pressable
              accessibilityLabel="Previous month"
              className="px-3 py-2"
              onPress={() => setVisibleMonth(new Date(year, month - 1, 1))}
            >
              <Text className="text-lg font-semibold text-black">‹</Text>
            </Pressable>
            <Text className="font-semibold text-black">
              {visibleMonth.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </Text>
            <Pressable
              accessibilityLabel="Next month"
              className="px-3 py-2"
              onPress={() => setVisibleMonth(new Date(year, month + 1, 1))}
            >
              <Text className="text-lg font-semibold text-black">›</Text>
            </Pressable>
          </View>

          <View className="flex-row">
            {weekdayLabels.map((label, index) => (
              <Text
                key={`${label}-${index}`}
                className="w-[14.285714%] py-1 text-center text-xs font-semibold text-neutral-400"
              >
                {label}
              </Text>
            ))}
          </View>

          <View className="flex-row flex-wrap">
            {cells.map((day, index) => {
              const dateKey = day
                ? getLocalDateKey(new Date(year, month, day))
                : null;
              const selected = dateKey === value;

              return (
                <View
                  key={`${day ?? "empty"}-${index}`}
                  className="w-[14.285714%] p-0.5"
                >
                  {day ? (
                    <Pressable
                      accessibilityLabel={`Set deadline ${dateKey}`}
                      className={`h-9 items-center justify-center rounded ${
                        selected
                          ? "bg-black"
                          : dateKey === today
                            ? "border border-neutral-400 bg-white"
                            : "bg-transparent"
                      }`}
                      onPress={() => {
                        onChange(dateKey);
                        setExpanded(false);
                      }}
                    >
                      <Text
                        className={`text-sm font-semibold ${
                          selected ? "text-white" : "text-black"
                        }`}
                      >
                        {day}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>

          <View className="mt-2 flex-row gap-2">
            <Pressable
              className="flex-1 rounded bg-white px-3 py-2"
              onPress={() => {
                onChange(null);
                setExpanded(false);
              }}
            >
              <Text className="text-center text-sm font-semibold text-neutral-500">
                Clear
              </Text>
            </Pressable>
            <Pressable
              className="flex-1 rounded bg-white px-3 py-2"
              onPress={() => {
                onChange(today);
                setVisibleMonth(toDate(today));
                setExpanded(false);
              }}
            >
              <Text className="text-center text-sm font-semibold text-black">
                Today
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function toDate(dateKey: string | null) {
  if (!dateKey) {
    return new Date();
  }

  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}
