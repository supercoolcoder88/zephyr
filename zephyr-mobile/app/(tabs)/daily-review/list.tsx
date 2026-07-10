import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { getAllDailyReviews } from "../../../db/dailyReview";
import {
  getAllTrackerLogsWithTrackers,
  upsertTrackerLogCount,
} from "../../../db/tracker";

type TrackerInputKey = `${number}:${string}`;

export default function DailyReviewListScreen() {
  const database = useSQLiteContext();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [inputs, setInputs] = useState<Record<TrackerInputKey, string>>({});

  const reviewsQuery = useQuery({
    queryKey: ["getAllDailyReviews"],
    queryFn: () => getAllDailyReviews(database),
  });
  const trackerLogsQuery = useQuery({
    queryKey: ["getAllTrackerLogsWithTrackers"],
    queryFn: () => getAllTrackerLogsWithTrackers(database),
  });

  useEffect(() => {
    if (!trackerLogsQuery.data) {
      return;
    }

    setInputs(
      Object.fromEntries(
        trackerLogsQuery.data.map((log) => [
          trackerInputKey(log.trackerId, log.date),
          String(log.count),
        ]),
      ),
    );
  }, [trackerLogsQuery.data]);

  const trackerLogsByReviewId = useMemo(() => {
    const logs = new Map<number, NonNullable<typeof trackerLogsQuery.data>>();

    for (const log of trackerLogsQuery.data ?? []) {
      logs.set(log.dailyReviewId, [
        ...(logs.get(log.dailyReviewId) ?? []),
        log,
      ]);
    }

    return logs;
  }, [trackerLogsQuery.data]);

  const updateTrackerLogMutation = useMutation({
    mutationFn: ({
      trackerId,
      date,
      count,
    }: {
      trackerId: number;
      date: string;
      count: number;
    }) => upsertTrackerLogCount(database, trackerId, date, count),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["getAllTrackerLogsWithTrackers"],
        }),
        queryClient.invalidateQueries({ queryKey: ["getAllDailyReviews"] }),
      ]);
    },
  });

  function updateTrackerScore(trackerId: number, date: string, value: string) {
    if (!/^\d*$/.test(value)) {
      return;
    }

    setInputs((current) => ({
      ...current,
      [trackerInputKey(trackerId, date)]: value,
    }));
    updateTrackerLogMutation.mutate({
      trackerId,
      date,
      count: value.length === 0 ? 0 : Number(value),
    });
  }

  const reviews = reviewsQuery.data ?? [];

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="px-5 pb-8 pt-4"
    >
      {reviewsQuery.isLoading || trackerLogsQuery.isLoading ? (
        <Text className="text-neutral-400">Loading reviews...</Text>
      ) : null}
      {reviewsQuery.isError || trackerLogsQuery.isError ? (
        <Text className="text-neutral-500">Unable to load reviews.</Text>
      ) : null}

      {!reviewsQuery.isLoading && reviews.length === 0 ? (
        <View className="bg-white py-8">
          <Text className="text-center font-semibold text-black">
            No reviews yet
          </Text>
        </View>
      ) : null}

      {reviews.map((review) => {
        const isExpanded = expandedId === review.id;
        const trackerLogs = trackerLogsByReviewId.get(review.id) ?? [];

        return (
          <View
            key={review.id}
            className="border-b border-neutral-100 bg-white py-3"
          >
            <Pressable
              className="flex-row items-center justify-between py-1"
              onPress={() =>
                setExpandedId((current) =>
                  current === review.id ? null : review.id,
                )
              }
            >
              <Text className="text-base font-semibold text-black">
                {review.date}
              </Text>
              <Text className="text-lg font-semibold text-neutral-400">
                {isExpanded ? "-" : "+"}
              </Text>
            </Pressable>

            {isExpanded ? (
              <View className="mt-4">
                {trackerLogs.length > 0 ? (
                  <View className="gap-3">
                    {trackerLogs.map((log) => {
                      const key = trackerInputKey(log.trackerId, log.date);

                      return (
                        <View key={key} className="flex-row items-center gap-3">
                          <Text className="flex-1 font-semibold text-black">
                            {log.name}
                          </Text>
                          <TextInput
                            className="w-24 rounded bg-neutral-100 px-2 py-2 text-center text-black"
                            keyboardType="number-pad"
                            onChangeText={(value) =>
                              updateTrackerScore(log.trackerId, log.date, value)
                            }
                            placeholder="0"
                            placeholderTextColor="#a3a3a3"
                            value={inputs[key] ?? String(log.count)}
                          />
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text className="font-semibold text-neutral-400">
                    No tracker logs
                  </Text>
                )}

                <View className="mt-4 border-t border-neutral-100 pt-4">
                  <View className="mb-3 flex-row justify-between">
                    <Text className="font-semibold text-neutral-500">
                      Habits complete
                    </Text>
                    <Text className="font-semibold text-black">
                      {review.habitsCompleted}
                    </Text>
                  </View>
                  <View className="mb-3 flex-row justify-between">
                    <Text className="font-semibold text-neutral-500">
                      Habits incomplete
                    </Text>
                    <Text className="font-semibold text-black">
                      {review.habitsIncomplete}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

function trackerInputKey(trackerId: number, date: string): TrackerInputKey {
  return `${trackerId}:${date}`;
}
