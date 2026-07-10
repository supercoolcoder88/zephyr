import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSQLiteContext } from "expo-sqlite";
import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { z } from "zod";

import FloatingAddButton from "../../../components/FloatingAddButton";
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
      className="border-b border-neutral-100 bg-white py-3"
      onPress={onPress}
    >
      <View className="flex-row items-center gap-3">
        <Text
          className={`flex-1 text-base font-semibold ${
            completed ? "text-neutral-400" : "text-black"
          }`}
        >
          {task.title}
        </Text>

        <Pressable
          accessibilityLabel={
            completed
              ? `Mark ${task.title} incomplete`
              : `Mark ${task.title} complete`
          }
          accessibilityRole="checkbox"
          accessibilityState={{ checked: completed }}
          className={`h-7 w-7 items-center justify-center rounded border-2 ${
            completed ? "border-black bg-black" : "border-neutral-300"
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
    <View className="flex-1 bg-white">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-28 pt-4"
      >
        {tasksQuery.isLoading ? (
          <Text className="text-neutral-400">Loading tasks...</Text>
        ) : null}
        {tasksQuery.isError ? (
          <Text className="text-neutral-500">Unable to load tasks.</Text>
        ) : null}
        {!tasksQuery.isLoading && tasks.length === 0 ? (
          <View className="bg-white py-8">
            <Text className="text-center font-semibold text-black">
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
          <View className="-mt-px">
            <Pressable
              className="-mx-5 flex-row items-center justify-between bg-neutral-100 px-5 py-3"
              onPress={() => setShowCompleted((current) => !current)}
            >
              <Text className="font-semibold text-neutral-500">
                Completed ({completedTasks.length})
              </Text>
              <Text className="text-lg font-semibold text-neutral-400">
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

      <FloatingAddButton
        accessibilityLabel="Create new task"
        onPress={openCreateDrawer}
      />

      <ItemDrawer
        deletePending={deleteTaskMutation.isPending}
        error={error}
        focusOnOpen={drawer?.mode === "create"}
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
          autoFocus={drawer?.mode === "create"}
          ref={titleInputRef}
          className="rounded bg-neutral-100 px-3 py-3 text-black"
          onChangeText={(title) =>
            setDrawer((current) =>
              current
                ? { ...current, input: { ...current.input, title } }
                : current,
            )
          }
          placeholder="Task title"
          placeholderTextColor="#a3a3a3"
          value={drawer?.input.title ?? ""}
        />
        <TextInput
          className="min-h-24 rounded bg-neutral-100 px-3 py-3 text-black"
          multiline
          onChangeText={(description) =>
            setDrawer((current) =>
              current
                ? { ...current, input: { ...current.input, description } }
                : current,
            )
          }
          placeholder="Description"
          placeholderTextColor="#a3a3a3"
          textAlignVertical="top"
          value={drawer?.input.description ?? ""}
        />
        <TextInput
          className="rounded bg-neutral-100 px-3 py-3 text-black"
          onChangeText={(deadline) =>
            setDrawer((current) =>
              current
                ? { ...current, input: { ...current.input, deadline } }
                : current,
            )
          }
          placeholder="Deadline"
          placeholderTextColor="#a3a3a3"
          value={drawer?.input.deadline ?? ""}
        />
      </ItemDrawer>
    </View>
  );
}
