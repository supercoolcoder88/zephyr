import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Pressable, ScrollView, Text, View } from "react-native";

import HabitItem from "../../../components/HabitItem/HabitItem";
import { getHabitsWithCompletion } from "../../../db/habit";
import { updateHabitLogStatus } from "../../../db/habitLog";

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function HabitScreen() {
  const database = useSQLiteContext();
  const queryClient = useQueryClient();
  const today = getLocalDateKey();

  const habitsQuery = useQuery({
    queryKey: ["getHabitsWithCompletion", today],
    queryFn: () => getHabitsWithCompletion(database, today),
  });

  const toggleHabitMutation = useMutation({
    mutationFn: (habitId: number) =>
      updateHabitLogStatus(database, habitId, today),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["getHabitsWithCompletion", today],
      });
    },
  });

  const habits = habitsQuery.data ?? [];

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerClassName="px-5 pb-8 pt-4"
    >
      {habitsQuery.isLoading ? (
        <Text className="text-gray-400">Loading habits...</Text>
      ) : null}
      {habitsQuery.isError ? (
        <Text className="text-gray-500">Unable to load habits.</Text>
      ) : null}
      {!habitsQuery.isLoading && habits.length === 0 ? (
        <View className="rounded border border-gray-100 bg-white px-4 py-8">
          <Text className="text-center font-semibold text-gray-950">
            No habits yet
          </Text>
          <Pressable
            className="mt-5 rounded bg-blue-950 px-4 py-3"
            onPress={() => router.push("/habit/create")}
          >
            <Text className="text-center font-semibold text-white">
              Create new habit
            </Text>
          </Pressable>
        </View>
      ) : null}

      {habits.map((habit) => (
        <HabitItem
          key={habit.id}
          completed={habit.status === "COMPLETE"}
          onToggle={() => toggleHabitMutation.mutate(habit.id)}
          score={habit.score}
          title={habit.title}
        />
      ))}
    </ScrollView>
  );
}
