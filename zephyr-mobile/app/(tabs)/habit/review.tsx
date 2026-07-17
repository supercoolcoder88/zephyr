import { useQuery } from "@tanstack/react-query";
import { useSQLiteContext } from "expo-sqlite";
import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { BarChart, type barDataItem } from "react-native-gifted-charts";

import {
  getHabitCompletionBreakdown,
  getHabitCompletionHistory,
} from "../../../db/habitReview";
import { useLocalDateKey } from "../../../hooks/useLocalDateKey";

type ReviewRange = 7 | 30;

function getChartLabel(dateKey: string, range: ReviewRange) {
  if (range === 30) {
    return String(Number(dateKey.split("-")[2]));
  }

  const [year, month, day] = dateKey.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
  });
}

function RangeButton({
  days,
  onPress,
  selected,
}: {
  days: ReviewRange;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`rounded px-4 py-2 ${selected ? "bg-black" : "bg-transparent"}`}
      onPress={onPress}
    >
      <Text
        className={`font-semibold ${selected ? "text-white" : "text-neutral-500"}`}
      >
        {days} days
      </Text>
    </Pressable>
  );
}

export default function HabitReviewScreen() {
  const database = useSQLiteContext();
  const today = useLocalDateKey();
  const { width } = useWindowDimensions();
  const [range, setRange] = useState<ReviewRange>(7);
  const reviewQuery = useQuery({
    queryKey: ["habitCompletionHistory", today, range],
    queryFn: async () => {
      const [history, habits] = await Promise.all([
        getHabitCompletionHistory(database, today, range),
        getHabitCompletionBreakdown(database, today, range),
      ]);

      return { habits, history };
    },
  });
  const chartData = useMemo<barDataItem[]>(
    () =>
      (reviewQuery.data?.history ?? []).map((day) => ({
        label: getChartLabel(day.date, range),
        value: day.completed,
      })),
    [range, reviewQuery.data?.history],
  );
  const highestValue = Math.max(0, ...chartData.map((item) => item.value ?? 0));
  const maxValue = Math.max(4, Math.ceil(highestValue / 4) * 4);
  const total = chartData.reduce((sum, item) => sum + (item.value ?? 0), 0);
  const dates = reviewQuery.data?.history.map((day) => day.date) ?? [];

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="px-5 pb-8 pt-5"
    >
      <View className="mb-6 self-start flex-row rounded bg-neutral-100 p-1">
        <RangeButton
          days={7}
          onPress={() => setRange(7)}
          selected={range === 7}
        />
        <RangeButton
          days={30}
          onPress={() => setRange(30)}
          selected={range === 30}
        />
      </View>

      {reviewQuery.isLoading ? (
        <Text className="text-neutral-400">Loading completions...</Text>
      ) : null}
      {reviewQuery.isError ? (
        <Text className="text-neutral-500">Unable to load completions.</Text>
      ) : null}

      {reviewQuery.data ? (
        <>
          <View className="mb-6 flex-row items-end justify-between">
            <Text className="font-semibold text-neutral-500">
              Last {range} days
            </Text>
            <Text className="text-lg font-bold text-black">
              {total} completed
            </Text>
          </View>
          <View className="-ml-2">
            <BarChart
              adjustToWidth={range === 7}
              barBorderTopLeftRadius={4}
              barBorderTopRightRadius={4}
              barWidth={range === 7 ? 26 : 10}
              data={chartData}
              disableScroll={range === 7}
              frontColor="#000000"
              height={220}
              initialSpacing={10}
              isAnimated
              maxValue={maxValue}
              noOfSections={4}
              parentWidth={width - 40}
              roundToDigits={0}
              rulesColor="#eeeeee"
              showFractionalValues={false}
              showValuesAsTopLabel
              spacing={range === 7 ? undefined : 10}
              stepValue={maxValue / 4}
              topLabelTextStyle={{
                color: "#737373",
                fontSize: 11,
                fontWeight: "600",
              }}
              xAxisColor="#e5e5e5"
              xAxisLabelTextStyle={{
                color: "#737373",
                fontSize: range === 7 ? 11 : 9,
                fontWeight: "600",
              }}
              yAxisColor="transparent"
              yAxisLabelWidth={30}
              yAxisTextStyle={{
                color: "#737373",
                fontSize: 10,
                fontWeight: "600",
              }}
            />
          </View>

          <View className="mt-8 border-t border-neutral-100">
            {reviewQuery.data.habits.length === 0 ? (
              <Text className="py-6 text-center font-semibold text-neutral-400">
                No habits yet
              </Text>
            ) : null}
            {reviewQuery.data.habits.map((habit) => {
              const completedDates = new Set(habit.completedDates);

              return (
                <View
                  key={habit.id}
                  accessible
                  accessibilityLabel={`${habit.title}, ${habit.completedDates.length} of ${range} days completed`}
                  className="flex-row items-center border-b border-neutral-100 py-4"
                >
                  <Text className="flex-1 font-semibold text-black">
                    {habit.title}
                  </Text>
                  {range === 7 ? (
                    <View className="ml-4 flex-row gap-2">
                      {dates.map((date) => (
                        <View
                          key={date}
                          className={`h-3 w-3 rounded-full border ${
                            completedDates.has(date)
                              ? "border-black bg-black"
                              : "border-neutral-300 bg-white"
                          }`}
                        />
                      ))}
                    </View>
                  ) : (
                    <Text className="ml-4 text-lg font-bold text-black">
                      {habit.completedDates.length}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}
