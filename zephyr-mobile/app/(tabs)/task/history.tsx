import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSQLiteContext } from "expo-sqlite";
import { ScrollView, Text, View } from "react-native";

import TaskItem from "../../../components/TaskItem";
import { getTasksWithCompletion } from "../../../db/task";
import { updateTaskLogStatus } from "../../../db/taskLog";
import { useLocalDateKey } from "../../../hooks/useLocalDateKey";

export default function TaskHistoryScreen() {
  const database = useSQLiteContext();
  const queryClient = useQueryClient();
  const today = useLocalDateKey();
  const tasksQuery = useQuery({
    queryKey: ["getTasksWithCompletion"],
    queryFn: () => getTasksWithCompletion(database),
  });
  const toggleTaskMutation = useMutation({
    mutationFn: (taskId: number) =>
      updateTaskLogStatus(database, taskId, today),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["getTasksWithCompletion"] }),
  });
  const completedTasks = (tasksQuery.data ?? [])
    .filter((task) => task.status === "COMPLETE")
    .sort((left, right) =>
      (right.statusDate ?? "").localeCompare(left.statusDate ?? ""),
    );

  return (
    <View className="flex-1 bg-white">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-10 pt-2"
      >
        {tasksQuery.isLoading ? (
          <Text className="py-6 text-center text-neutral-400">
            Loading history...
          </Text>
        ) : null}
        {tasksQuery.isError ? (
          <Text className="py-6 text-center text-neutral-500">
            Unable to load history.
          </Text>
        ) : null}
        {!tasksQuery.isLoading && completedTasks.length === 0 ? (
          <Text className="py-10 text-center font-semibold text-neutral-400">
            No completed tasks
          </Text>
        ) : null}

        {completedTasks.map((task) => (
          <TaskItem
            key={task.id}
            onToggle={() => toggleTaskMutation.mutate(task.id)}
            task={task}
            today={today}
          />
        ))}
      </ScrollView>
    </View>
  );
}
