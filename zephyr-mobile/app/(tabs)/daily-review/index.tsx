import { useQuery } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import ExpoIcon, { selectIcon } from "../../../components/ExpoIcon";
import ReviewLineChart from "../../../components/ReviewLineChart";
import {
  getAllDailyReviews,
  getOrCreateDailyReviewByDate,
} from "../../../db/dailyReview";
import {
  getAllTrackerLogsWithTrackers,
  getTrackersWithLog,
} from "../../../db/tracker";

const listIcon = selectIcon({
  android: "list",
  ios: "list.bullet",
});

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getShortDateLabel(date: string) {
  const day = date.split("-")[2];

  return day ? String(Number(day)) : date;
}

function getMonthKey(date: string) {
  return date.slice(0, 7);
}

function getMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export default function ReviewScreen() {
  const database = useSQLiteContext();
  const today = getLocalDateKey();
  const [selectedMonth, setSelectedMonth] = useState(getMonthKey(today));
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const reviewQuery = useQuery({
    queryKey: ["getOrCreateDailyReviewByDate", today],
    queryFn: () => getOrCreateDailyReviewByDate(database, today),
  });
  const trackersQuery = useQuery({
    queryKey: ["getTrackersWithLog", today],
    queryFn: () => getTrackersWithLog(database, today),
  });
  const reviewsQuery = useQuery({
    queryKey: ["getAllDailyReviews"],
    queryFn: () => getAllDailyReviews(database),
  });
  const trackerLogsQuery = useQuery({
    queryKey: ["getAllTrackerLogsWithTrackers"],
    queryFn: () => getAllTrackerLogsWithTrackers(database),
  });

  const review = reviewQuery.data;
  const trackers = trackersQuery.data ?? [];
  const loggedTrackers = trackers.filter((tracker) => tracker.date !== null);
  const monthOptions = useMemo(() => {
    const months = new Set([
      getMonthKey(today),
      ...(reviewsQuery.data ?? []).map((review) => getMonthKey(review.date)),
    ]);

    return [...months].sort((left, right) => right.localeCompare(left));
  }, [reviewsQuery.data, today]);
  const chartData = useMemo(() => {
    const reviews = [...(reviewsQuery.data ?? [])]
      .filter((review) => getMonthKey(review.date) === selectedMonth)
      .sort((left, right) => left.date.localeCompare(right.date));
    const trackerIds = new Map<number, string>();
    const trackerCountsByReview = new Map<string, number>();

    for (const log of trackerLogsQuery.data ?? []) {
      trackerIds.set(log.trackerId, log.name);
      trackerCountsByReview.set(
        `${log.trackerId}:${log.dailyReviewId}`,
        log.count,
      );
    }

    return {
      habitCompletedSeries: {
        id: "habits-completed",
        label: "Habits done (right)",
        values: reviews.map((review) => review.habitsCompleted),
      },
      labels: reviews.map((review) => getShortDateLabel(review.date)),
      trackerSeries: [...trackerIds.entries()].map(([trackerId, name]) => ({
        id: String(trackerId),
        label: name,
        values: reviews.map(
          (review) =>
            trackerCountsByReview.get(`${trackerId}:${review.id}`) ?? 0,
        ),
      })),
    };
  }, [reviewsQuery.data, selectedMonth, trackerLogsQuery.data]);
  const chartKey = [
    chartData.labels.join(","),
    chartData.habitCompletedSeries.values.join(","),
    ...chartData.trackerSeries.map(
      (series) => `${series.id}:${series.values.join(",")}`,
    ),
  ].join("|");

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              accessibilityLabel="Review list"
              className="rounded bg-black px-4 py-2"
              onPress={() => router.push("/daily-review/list")}
            >
              <ExpoIcon color="#ffffff" name={listIcon} size={20} />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        className="flex-1 bg-white"
        contentContainerClassName="pb-8 pt-4"
      >
        {reviewQuery.isLoading ||
        trackersQuery.isLoading ||
        reviewsQuery.isLoading ||
        trackerLogsQuery.isLoading ? (
          <Text className="mx-5 text-neutral-400">Loading review...</Text>
        ) : null}
        {reviewQuery.isError ||
        trackersQuery.isError ||
        reviewsQuery.isError ||
        trackerLogsQuery.isError ? (
          <Text className="mx-5 text-neutral-500">Unable to load review.</Text>
        ) : null}

        <View className="items-start px-5">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showMonthPicker }}
            className="flex-row items-center gap-1 py-2"
            onPress={() => setShowMonthPicker((current) => !current)}
          >
            <Text className="text-sm font-semibold text-black underline">
              {getMonthLabel(selectedMonth)}
            </Text>
            <Text className="text-sm font-semibold text-neutral-500">
              {showMonthPicker ? "⌃" : "⌄"}
            </Text>
          </Pressable>
          {showMonthPicker ? (
            <View className="items-start bg-white">
              {monthOptions.map((month) => (
                <Pressable
                  key={month}
                  className="px-2 py-2"
                  onPress={() => {
                    setSelectedMonth(month);
                    setShowMonthPicker(false);
                  }}
                >
                  <Text
                    className={`font-semibold ${
                      month === selectedMonth
                        ? "text-black"
                        : "text-neutral-500"
                    }`}
                  >
                    {getMonthLabel(month)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <View className="mb-5">
          <ReviewLineChart
            key={chartKey}
            habitCompletedSeries={chartData.habitCompletedSeries}
            labels={chartData.labels}
            trackerSeries={chartData.trackerSeries}
          />
        </View>

        <View className="px-5">
          <View className="border-b border-neutral-200 pb-2">
            <Text className="text-base font-semibold text-black">
              Today's stats
            </Text>
          </View>

          {review ? (
            <View className="border-b border-neutral-100 bg-white py-3">
              <View className="flex-row flex-wrap items-center justify-between gap-3">
                <Text className="font-semibold text-black">Habits</Text>
                <View className="flex-row gap-3">
                  <Text className="font-semibold text-green-700">
                    {review.habitsCompleted} done
                  </Text>
                  <Text className="font-semibold text-red-700">
                    {review.habitsIncomplete} incomplete
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {loggedTrackers.length === 0 && !trackersQuery.isLoading ? (
            <View className="bg-white py-4">
              <Text className="text-center font-semibold text-black">
                No tracker logs today
              </Text>
            </View>
          ) : null}

          {loggedTrackers.map((tracker) => (
            <View
              key={tracker.id}
              className="border-b border-neutral-100 bg-white py-3"
            >
              <View className="flex-row justify-between">
                <Text className="font-semibold text-black">{tracker.name}</Text>
                <Text className="font-semibold text-black">
                  {tracker.count}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </>
  );
}
