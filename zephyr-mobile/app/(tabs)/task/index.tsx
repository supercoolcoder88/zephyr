import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Pressable, ScrollView, Text, View } from "react-native";

import { getAllTasks } from "../../../db/task";

export default function TaskScreen() {
  const database = useSQLiteContext();

  const tasksQuery = useQuery({
    queryKey: ["getTasks"],
    queryFn: () => getAllTasks(database),
  });

  const tasks = tasksQuery.data ?? [];

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerClassName="px-5 pb-8 pt-4"
    >
      {tasksQuery.isLoading ? (
        <Text className="text-gray-400">Loading tasks...</Text>
      ) : null}
      {tasksQuery.isError ? (
        <Text className="text-gray-500">Unable to load tasks.</Text>
      ) : null}
      {!tasksQuery.isLoading && tasks.length === 0 ? (
        <View className="rounded border border-gray-100 bg-white px-4 py-8">
          <Text className="text-center font-semibold text-gray-950">
            No tasks yet
          </Text>
          <Pressable
            className="mt-5 rounded bg-blue-950 px-4 py-3"
            onPress={() => router.push("/task/create")}
          >
            <Text className="text-center font-semibold text-white">
              Create new task
            </Text>
          </Pressable>
        </View>
      ) : null}

      {tasks.map((task) => (
        <View
          key={task.id}
          className="mb-4 rounded border border-gray-200 bg-white px-4 py-4 shadow-sm"
        >
          <Text className="text-base font-semibold text-gray-950">
            {task.title}
          </Text>
          {task.deadline ? (
            <Text className="mt-1 text-xs text-blue-950">{task.deadline}</Text>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}
