import { useQuery } from "@tanstack/react-query";
import { useSQLiteContext } from "expo-sqlite";
import { ScrollView, Text, View } from "react-native";

import { getOrCreateDailyReviewByDate } from "../../../db/dailyReview";
import { getTrackersWithLog } from "../../../db/tracker";

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function ReviewScreen() {
  const database = useSQLiteContext();
  const today = getLocalDateKey();

  const reviewQuery = useQuery({
    queryKey: ["getOrCreateDailyReviewByDate", today],
    queryFn: () => getOrCreateDailyReviewByDate(database, today),
  });
  const trackersQuery = useQuery({
    queryKey: ["getTrackersWithLog", today],
    queryFn: () => getTrackersWithLog(database, today),
  });

  const review = reviewQuery.data;
  const trackers = trackersQuery.data ?? [];
  const loggedTrackers = trackers.filter((tracker) => tracker.date !== null);
  const trackerTotal = loggedTrackers.reduce(
    (total, tracker) => total + tracker.count,
    0,
  );

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerClassName="px-5 pb-8 pt-4"
    >
      <Text className="mb-3 text-sm font-semibold text-gray-500">
        {today}
      </Text>

      {reviewQuery.isLoading || trackersQuery.isLoading ? (
        <Text className="text-gray-400">Loading review...</Text>
      ) : null}
      {reviewQuery.isError || trackersQuery.isError ? (
        <Text className="text-gray-500">Unable to load review.</Text>
      ) : null}

      {review ? (
        <View className="mb-4 rounded border border-gray-100 bg-white px-4 py-4">
          <View className="mb-3 flex-row justify-between">
            <Text className="font-semibold text-gray-950">Habits complete</Text>
            <Text className="font-semibold text-gray-950">
              {review.habitsCompleted}
            </Text>
          </View>
          <View className="mb-3 flex-row justify-between">
            <Text className="font-semibold text-gray-950">
              Habits incomplete
            </Text>
            <Text className="font-semibold text-gray-950">
              {review.habitsIncomplete}
            </Text>
          </View>
          <View className="mb-3 flex-row justify-between">
            <Text className="font-semibold text-gray-950">Habit score</Text>
            <Text className="font-semibold text-blue-950">
              {review.habitsScore}
            </Text>
          </View>
          <View className="mb-3 flex-row justify-between">
            <Text className="font-semibold text-gray-950">Tasks complete</Text>
            <Text className="font-semibold text-gray-950">
              {review.tasksCompleted}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="font-semibold text-gray-950">
              Tasks incomplete
            </Text>
            <Text className="font-semibold text-gray-950">
              {review.tasksIncomplete}
            </Text>
          </View>
        </View>
      ) : null}

      <View className="mb-3 flex-row justify-between rounded border border-gray-100 bg-white px-4 py-4">
        <Text className="font-semibold text-gray-950">Tracker total</Text>
        <Text className="font-semibold text-blue-950">{trackerTotal}</Text>
      </View>

      {loggedTrackers.length === 0 && !trackersQuery.isLoading ? (
        <View className="rounded border border-gray-100 bg-white px-4 py-8">
          <Text className="text-center font-semibold text-gray-950">
            No tracker logs today
          </Text>
        </View>
      ) : null}

      {loggedTrackers.map((tracker) => (
        <View
          key={tracker.id}
          className="mb-3 rounded border border-gray-200 bg-white px-4 py-3 shadow-sm"
        >
          <View className="flex-row justify-between">
            <Text className="font-semibold text-gray-950">{tracker.name}</Text>
            <Text className="font-semibold text-gray-950">
              {tracker.count}
            </Text>
          </View>
          <Text className="mt-1 text-xs font-semibold text-gray-400">
            review #{tracker.dailyReviewId}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}
