import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSQLiteContext } from "expo-sqlite";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { z } from "zod";

import {
  deleteTask,
  getAllTasks,
  updateTask,
  type Task,
  type UpdateTaskInput,
} from "../../../db/task";

const updateTaskInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  deadline: z
    .string()
    .trim()
    .transform((deadline) => (deadline.length > 0 ? deadline : null)),
});

type EditingTask = {
  id: number;
  title: string;
  deadline: string;
};

function toEditingTask(task: Task): EditingTask {
  return {
    id: task.id,
    title: task.title,
    deadline: task.deadline ?? "",
  };
}

export default function TaskListScreen() {
  const database = useSQLiteContext();
  const queryClient = useQueryClient();
  const [editingTask, setEditingTask] = useState<EditingTask | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tasksQuery = useQuery({
    queryKey: ["getTasks"],
    queryFn: () => getAllTasks(database),
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateTaskInput }) =>
      updateTask(database, id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["getTasks"] });
      setEditingTask(null);
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: number) => deleteTask(database, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["getTasks"] });
      setEditingTask(null);
      setDeletingTaskId(null);
    },
  });

  async function handleSave() {
    if (!editingTask) {
      return;
    }

    setError(null);

    try {
      const input = updateTaskInputSchema.parse({
        title: editingTask.title,
        deadline: editingTask.deadline,
      });

      await updateTaskMutation.mutateAsync({
        id: editingTask.id,
        input,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0]?.message ?? "Invalid task");
        return;
      }

      setError("Unable to update task.");
    }
  }

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

      {tasks.map((task) => {
        const isEditing = editingTask?.id === task.id;
        const isDeleting = deletingTaskId === task.id;

        return (
          <View
            key={task.id}
            className="mb-3 rounded border border-gray-200 bg-white shadow-sm"
          >
            {isDeleting ? (
              <View className="p-4">
                <View className="flex-row items-center">
                  <View className="mr-4 h-10 min-w-10 items-center justify-center rounded bg-gray-100 px-2">
                    <Text className="text-xs font-semibold text-gray-400">
                      {task.deadline || "Any"}
                    </Text>
                  </View>
                  <Text className="flex-1 text-base font-semibold text-gray-950">
                    Delete {task.title}?
                  </Text>
                </View>
                <View className="mt-4 flex-row gap-2">
                  <Pressable
                    className="flex-1 rounded border border-gray-200 px-3 py-3"
                    onPress={() => setDeletingTaskId(null)}
                  >
                    <Text className="text-center font-semibold text-blue-950">
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    className="flex-1 rounded bg-red-700 px-3 py-3"
                    disabled={deleteTaskMutation.isPending}
                    onPress={() => deleteTaskMutation.mutate(task.id)}
                  >
                    <Text className="text-center font-semibold text-white">
                      Confirm
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : isEditing && editingTask ? (
              <View className="gap-3 p-4">
                <TextInput
                  className="rounded border border-gray-200 bg-gray-50 px-3 py-3 text-gray-950"
                  onChangeText={(title) =>
                    setEditingTask((current) =>
                      current ? { ...current, title } : current,
                    )
                  }
                  placeholder="Task title"
                  placeholderTextColor="#9ca3af"
                  value={editingTask.title}
                />
                <TextInput
                  className="rounded border border-gray-200 bg-gray-50 px-3 py-3 text-gray-950"
                  onChangeText={(deadline) =>
                    setEditingTask((current) =>
                      current ? { ...current, deadline } : current,
                    )
                  }
                  placeholder="Deadline"
                  placeholderTextColor="#9ca3af"
                  value={editingTask.deadline}
                />
                {error ? (
                  <Text className="text-sm text-gray-500">{error}</Text>
                ) : null}
                <View className="flex-row gap-2">
                  <Pressable
                    className="flex-1 rounded border border-gray-200 px-3 py-3"
                    onPress={() => {
                      setEditingTask(null);
                      setDeletingTaskId(null);
                      setError(null);
                    }}
                  >
                    <Text className="text-center font-semibold text-blue-950">
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    className="flex-1 rounded bg-blue-950 px-3 py-3"
                    disabled={updateTaskMutation.isPending}
                    onPress={handleSave}
                  >
                    <Text className="text-center font-semibold text-white">
                      {updateTaskMutation.isPending ? "Saving..." : "Save"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View className="p-4">
                <View className="flex-row items-center">
                  <View className="mr-4 h-10 min-w-10 items-center justify-center rounded bg-blue-50 px-2">
                    <Text className="text-xs font-semibold text-blue-950">
                      {task.deadline || "Any"}
                    </Text>
                  </View>
                  <Text className="flex-1 text-base font-semibold text-gray-950">
                    {task.title}
                  </Text>
                </View>
                <View className="mt-4 flex-row gap-2 border-t border-gray-100 pt-3">
                  <Pressable
                    className="flex-1 rounded border border-gray-200 px-3 py-3"
                    onPress={() => {
                      setEditingTask(toEditingTask(task));
                      setDeletingTaskId(null);
                      setError(null);
                    }}
                  >
                    <Text className="text-center font-semibold text-blue-950">
                      Edit
                    </Text>
                  </Pressable>
                  <Pressable
                    className="flex-1 rounded bg-red-700 px-3 py-3"
                    onPress={() => {
                      setEditingTask(null);
                      setDeletingTaskId(task.id);
                      setError(null);
                    }}
                  >
                    <Text className="text-center font-semibold text-white">
                      Delete
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}
