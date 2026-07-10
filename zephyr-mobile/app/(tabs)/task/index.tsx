import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSQLiteContext } from "expo-sqlite";
import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { z } from "zod";

import ItemDrawer from "../../../components/ItemDrawer";
import {
  createTask,
  deleteTask,
  getTasksWithCompletion,
  updateTask,
  type CreateTaskInput,
  type TaskWithCompletion,
  type UpdateTaskInput,
} from "../../../db/task";
import { updateTaskLogStatus } from "../../../db/taskLog";
import { getLocalDateKey } from "../../../utils/date";

const optionalTextSchema = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null));

const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: optionalTextSchema,
  deadline: optionalTextSchema,
});

type TaskInput = {
  title: string;
  description: string;
  deadline: string;
};

type TaskDrawerState =
  | {
      mode: "create";
      input: TaskInput;
    }
  | {
      mode: "update";
      id: number;
      input: TaskInput;
    };

function toTaskInput(task: TaskWithCompletion): TaskInput {
  return {
    title: task.title,
    description: task.description ?? "",
    deadline: task.deadline ?? "",
  };
}

type TaskItemProps = {
  completed: boolean;
  onPress: () => void;
  onToggle: () => void;
  task: TaskWithCompletion;
};

function TaskItem({ completed, onPress, onToggle, task }: TaskItemProps) {
  return (
    <Pressable
      className={`mb-3 rounded border px-4 py-4 shadow-sm ${
        completed ? "border-gray-100 bg-gray-100" : "border-gray-200 bg-white"
      }`}
      onPress={onPress}
    >
      <View className="flex-row items-start gap-3">
        <View className="flex-1">
          <Text
            className={`text-base font-semibold ${
              completed ? "text-gray-400" : "text-gray-950"
            }`}
          >
            {task.title}
          </Text>
          {task.description ? (
            <Text className="mt-1 text-sm leading-5 text-gray-500">
              {task.description}
            </Text>
          ) : null}
          {task.deadline ? (
            <View className="mt-3 self-start rounded bg-blue-50 px-2 py-1">
              <Text className="text-xs font-semibold text-blue-950">
                {task.deadline}
              </Text>
            </View>
          ) : null}
        </View>

        <Pressable
          accessibilityLabel={
            completed
              ? `Mark ${task.title} incomplete`
              : `Mark ${task.title} complete`
          }
          accessibilityRole="checkbox"
          accessibilityState={{ checked: completed }}
          className={`h-7 w-7 items-center justify-center rounded border-2 ${
            completed ? "border-blue-950 bg-blue-950" : "border-gray-300"
          }`}
          onPress={onToggle}
        >
          {completed ? <View className="h-3 w-3 rounded bg-white" /> : null}
        </Pressable>
      </View>
    </Pressable>
  );
}

export default function TaskScreen() {
  const database = useSQLiteContext();
  const queryClient = useQueryClient();
  const today = getLocalDateKey();
  const [drawer, setDrawer] = useState<TaskDrawerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const titleInputRef = useRef<TextInput>(null);

  function openCreateDrawer() {
    setDrawer({
      mode: "create",
      input: { title: "", description: "", deadline: "" },
    });
    setError(null);
  }

  function openUpdateDrawer(task: TaskWithCompletion) {
    setDrawer({
      mode: "update",
      id: task.id,
      input: toTaskInput(task),
    });
    setError(null);
  }

  const tasksQuery = useQuery({
    queryKey: ["getTasksWithCompletion", today],
    queryFn: () => getTasksWithCompletion(database, today),
  });

  const toggleTaskMutation = useMutation({
    mutationFn: (taskId: number) =>
      updateTaskLogStatus(database, taskId, today),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["getTasksWithCompletion", today],
        }),
        queryClient.invalidateQueries({
          queryKey: ["getOrCreateDailyReviewByDate"],
        }),
        queryClient.invalidateQueries({ queryKey: ["getAllDailyReviews"] }),
      ]);
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(database, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["getTasks"] }),
        queryClient.invalidateQueries({ queryKey: ["getTasksWithCompletion"] }),
        queryClient.invalidateQueries({
          queryKey: ["getOrCreateDailyReviewByDate"],
        }),
        queryClient.invalidateQueries({ queryKey: ["getAllDailyReviews"] }),
      ]);
      setDrawer(null);
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateTaskInput }) =>
      updateTask(database, id, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["getTasks"] }),
        queryClient.invalidateQueries({ queryKey: ["getTasksWithCompletion"] }),
        queryClient.invalidateQueries({
          queryKey: ["getOrCreateDailyReviewByDate"],
        }),
        queryClient.invalidateQueries({ queryKey: ["getAllDailyReviews"] }),
      ]);
      setDrawer(null);
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: number) => deleteTask(database, id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["getTasks"] }),
        queryClient.invalidateQueries({ queryKey: ["getTasksWithCompletion"] }),
        queryClient.invalidateQueries({
          queryKey: ["getOrCreateDailyReviewByDate"],
        }),
        queryClient.invalidateQueries({ queryKey: ["getAllDailyReviews"] }),
      ]);
      setDrawer(null);
    },
  });

  async function handleSubmit() {
    if (!drawer) {
      return;
    }

    setError(null);

    try {
      const input = taskInputSchema.parse(drawer.input);

      if (drawer.mode === "create") {
        await createTaskMutation.mutateAsync(input);
      } else {
        await updateTaskMutation.mutateAsync({ id: drawer.id, input });
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0]?.message ?? "Invalid task");
        return;
      }

      setError("Unable to save task.");
    }
  }

  const tasks = tasksQuery.data ?? [];
  const activeTasks = tasks.filter((task) => task.status !== "COMPLETE");
  const completedTasks = tasks.filter((task) => task.status === "COMPLETE");

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-28 pt-4"
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
          </View>
        ) : null}

        {activeTasks.map((task) => (
          <TaskItem
            key={task.id}
            completed={false}
            onPress={() => openUpdateDrawer(task)}
            onToggle={() => toggleTaskMutation.mutate(task.id)}
            task={task}
          />
        ))}

        {completedTasks.length > 0 ? (
          <View className="mt-2">
            <Pressable
              className="mb-3 flex-row items-center justify-between rounded border border-gray-200 bg-white px-4 py-3"
              onPress={() => setShowCompleted((current) => !current)}
            >
              <Text className="font-semibold text-gray-950">
                Completed ({completedTasks.length})
              </Text>
              <Text className="text-lg font-semibold text-gray-400">
                {showCompleted ? "-" : "+"}
              </Text>
            </Pressable>
            {showCompleted
              ? completedTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    completed
                    onPress={() => openUpdateDrawer(task)}
                    onToggle={() => toggleTaskMutation.mutate(task.id)}
                    task={task}
                  />
                ))
              : null}
          </View>
        ) : null}
      </ScrollView>

      <Pressable
        accessibilityLabel="Create new task"
        className="absolute bottom-6 right-5 h-14 w-14 items-center justify-center rounded-full bg-blue-950 shadow-lg"
        onPress={openCreateDrawer}
      >
        <Text className="text-3xl font-light leading-8 text-white">+</Text>
      </Pressable>

      <ItemDrawer
        deletePending={deleteTaskMutation.isPending}
        error={error}
        onClose={() => {
          setDrawer(null);
          setError(null);
        }}
        onDelete={
          drawer?.mode === "update"
            ? () => deleteTaskMutation.mutate(drawer.id)
            : undefined
        }
        initialFocusRef={titleInputRef}
        onSubmit={handleSubmit}
        submitLabel={drawer?.mode === "update" ? "Save task" : "Create task"}
        submitPending={
          createTaskMutation.isPending || updateTaskMutation.isPending
        }
        title={drawer?.mode === "update" ? "Edit task" : "New task"}
        visible={drawer !== null}
      >
        <TextInput
          autoFocus
          ref={titleInputRef}
          className="rounded border border-gray-200 bg-gray-50 px-3 py-3 text-gray-950"
          onChangeText={(title) =>
            setDrawer((current) =>
              current
                ? { ...current, input: { ...current.input, title } }
                : current,
            )
          }
          placeholder="Task title"
          placeholderTextColor="#9ca3af"
          value={drawer?.input.title ?? ""}
        />
        <TextInput
          className="min-h-24 rounded border border-gray-200 bg-gray-50 px-3 py-3 text-gray-950"
          multiline
          onChangeText={(description) =>
            setDrawer((current) =>
              current
                ? { ...current, input: { ...current.input, description } }
                : current,
            )
          }
          placeholder="Description"
          placeholderTextColor="#9ca3af"
          textAlignVertical="top"
          value={drawer?.input.description ?? ""}
        />
        <TextInput
          className="rounded border border-gray-200 bg-gray-50 px-3 py-3 text-gray-950"
          onChangeText={(deadline) =>
            setDrawer((current) =>
              current
                ? { ...current, input: { ...current.input, deadline } }
                : current,
            )
          }
          placeholder="Deadline"
          placeholderTextColor="#9ca3af"
          value={drawer?.input.deadline ?? ""}
        />
      </ItemDrawer>
    </View>
  );
}
