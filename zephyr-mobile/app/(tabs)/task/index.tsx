import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useNavigation } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useLayoutEffect, useRef, useState } from "react";
import {
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { z } from "zod";

import DatePicker from "../../../components/DatePicker";
import FloatingAddButton from "../../../components/FloatingAddButton";
import ItemDrawer from "../../../components/ItemDrawer";
import TaskItem from "../../../components/TaskItem";
import { getAllFolders, type Folder } from "../../../db/folder";
import {
  createTask,
  deleteTask,
  getTasksWithCompletion,
  updateTask,
  type CreateTaskInput,
  type TaskPriority,
  type TaskWithCompletion,
  type UpdateTaskInput,
} from "../../../db/task";
import { updateTaskLogStatus } from "../../../db/taskLog";
import { useLocalDateKey } from "../../../hooks/useLocalDateKey";
import {
  getFolderCommand,
  parseTaskTitleCommands,
  removeFolderCommand,
  removePriorityCommand,
} from "../../../utils/taskTags";

const optionalTextSchema = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null));

const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: optionalTextSchema,
  deadline: z.string().nullable(),
  priority: z.enum(["NONE", "LOW", "MEDIUM", "HIGH"]),
  scheduledDate: z.string().nullable(),
  folderName: optionalTextSchema,
});

type TaskInput = {
  title: string;
  description: string;
  deadline: string | null;
  priority: TaskPriority;
  scheduledDate: string | null;
  folderName: string;
};

type TaskDrawerState =
  | { mode: "create"; input: TaskInput }
  | { mode: "update"; id: number; input: TaskInput };

type TaskView = "today" | "backlog";

type TaskFilter =
  | { type: "folder"; id: number; label: string }
  | { type: "tag"; label: string }
  | null;

function toTaskInput(task: TaskWithCompletion): TaskInput {
  return {
    title: task.title,
    description: task.description ?? "",
    deadline: task.deadline,
    priority: task.priority,
    scheduledDate: task.scheduledDate,
    folderName: task.folderName ?? "",
  };
}

export default function TaskScreen() {
  const navigation = useNavigation();
  const database = useSQLiteContext();
  const queryClient = useQueryClient();
  const today = useLocalDateKey();
  const [drawer, setDrawer] = useState<TaskDrawerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<TaskView>("today");
  const [filter, setFilter] = useState<TaskFilter>(null);
  const [folderMenuVisible, setFolderMenuVisible] = useState(false);
  const titleInputRef = useRef<TextInput>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const screenPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > 16 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dx <= -72 && viewRef.current === "today") {
          setView("backlog");
        } else if (gesture.dx >= 72 && viewRef.current === "backlog") {
          setView("today");
        }
      },
    }),
  ).current;

  const tasksQuery = useQuery({
    queryKey: ["getTasksWithCompletion"],
    queryFn: () => getTasksWithCompletion(database),
  });
  const foldersQuery = useQuery({
    queryKey: ["getAllFolders"],
    queryFn: () => getAllFolders(database),
  });

  const toggleTaskMutation = useMutation({
    mutationFn: (taskId: number) =>
      updateTaskLogStatus(database, taskId, today),
    onSuccess: () => invalidateTaskQueries(queryClient),
  });
  const createTaskMutation = useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(database, input),
    onSuccess: async () => {
      await invalidateTaskQueries(queryClient);
      setDrawer(null);
    },
  });
  const updateTaskMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateTaskInput }) =>
      updateTask(database, id, input),
    onSuccess: async () => {
      await invalidateTaskQueries(queryClient);
      setDrawer(null);
    },
  });
  const deleteTaskMutation = useMutation({
    mutationFn: (id: number) => deleteTask(database, id),
    onSuccess: async () => {
      await invalidateTaskQueries(queryClient);
      setDrawer(null);
    },
  });
  const moveTaskMutation = useMutation({
    mutationFn: ({
      id,
      scheduledDate,
    }: {
      id: number;
      scheduledDate: string | null;
    }) => updateTask(database, id, { scheduledDate }),
    onSuccess: () => invalidateTaskQueries(queryClient),
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: undefined,
      headerTitle: () => (
        <View className="w-full flex-row items-center gap-2">
          <Text className="text-2xl font-bold text-black">Tasks</Text>
          <Pressable
            accessibilityLabel="Filter tasks by folder or tag"
            accessibilityRole="button"
            className="flex-1 flex-row items-center justify-between rounded-xl border border-neutral-200 bg-white px-3 py-2"
            onPress={() => setFolderMenuVisible(true)}
          >
            <Text className="shrink font-semibold text-black" numberOfLines={1}>
              {filter?.type === "tag"
                ? `#${filter.label}`
                : filter?.type === "folder"
                  ? `/${filter.label}`
                  : "All"}
            </Text>
            <Text className="text-neutral-500">⌄</Text>
          </Pressable>
        </View>
      ),
      headerTitleContainerStyle: { left: 16, right: 16 },
    });
  }, [filter, navigation]);

  function openCreateDrawer() {
    const selectedFolderName =
      filter?.type === "folder" ? filter.label : undefined;

    setDrawer({
      mode: "create",
      input: {
        title: "",
        description: "",
        deadline: null,
        priority: "NONE",
        scheduledDate: null,
        folderName: selectedFolderName ?? "",
      },
    });
    setError(null);
  }

  function updateTaskTitle(title: string) {
    const commands = parseTaskTitleCommands(title);
    const folderName = commands.folderToken
      ? resolveFolderCommand(commands.folderToken, foldersQuery.data ?? [])
      : undefined;

    setDrawer((current) => {
      if (!current) {
        return current;
      }

      const previousCommands = parseTaskTitleCommands(current.input.title);

      return {
        ...current,
        input: {
          ...current.input,
          title,
          folderName:
            folderName ??
            (previousCommands.folderToken ? "" : current.input.folderName),
          priority:
            commands.priority ??
            (previousCommands.priorityCommand
              ? "NONE"
              : current.input.priority),
        },
      };
    });
  }

  function openUpdateDrawer(task: TaskWithCompletion) {
    setDrawer({ mode: "update", id: task.id, input: toTaskInput(task) });
    setError(null);
  }

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
  const folders = foldersQuery.data ?? [];
  const tags = [...new Set(tasks.flatMap((task) => task.tags))].sort(
    (left, right) => left.localeCompare(right),
  );
  const drawerCommands = parseTaskTitleCommands(drawer?.input.title ?? "");
  const visibleTasks = tasks.filter((task) => {
    if (filter?.type === "folder" && task.folderId !== filter.id) {
      return false;
    }

    if (filter?.type === "tag" && !task.tags.includes(filter.label)) {
      return false;
    }

    if (task.status === "COMPLETE") {
      return false;
    }

    const scheduledForToday = isTaskForToday(task, today);
    return view === "today" ? scheduledForToday : !scheduledForToday;
  });

  return (
    <View className="flex-1 bg-white">
      <View className="border-b border-neutral-100 px-5 pb-3 pt-2">
        <View className="flex-row rounded-lg bg-neutral-100 p-1">
          {(["today", "backlog"] as const).map((option) => (
            <Pressable
              key={option}
              accessibilityRole="tab"
              accessibilityState={{ selected: view === option }}
              className={`flex-1 rounded-md px-3 py-2 ${
                view === option ? "bg-white" : "bg-transparent"
              }`}
              onPress={() => setView(option)}
            >
              <Text
                className={`text-center text-sm font-semibold ${
                  view === option ? "text-black" : "text-neutral-500"
                }`}
              >
                {option === "today" ? "Today" : "Backlog"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FilterDropdown
        activeFilter={filter}
        folders={folders}
        onClose={() => setFolderMenuVisible(false)}
        onHistory={() => {
          setFolderMenuVisible(false);
          router.push("/task/history");
        }}
        onSelect={(selectedFilter) => {
          setFilter(selectedFilter);
          if (selectedFilter) {
            setView("backlog");
          }
          setFolderMenuVisible(false);
        }}
        tags={tags}
        visible={folderMenuVisible}
      />

      <View className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerClassName="min-h-full px-5 pb-28 pt-2"
        >
          {tasksQuery.isLoading ? (
            <Text className="py-6 text-center text-neutral-400">
              Loading tasks...
            </Text>
          ) : null}
          {tasksQuery.isError ? (
            <Text className="py-6 text-center text-neutral-500">
              Unable to load tasks.
            </Text>
          ) : null}
          {!tasksQuery.isLoading && visibleTasks.length === 0 ? (
            <Text className="py-10 text-center font-semibold text-neutral-400">
              {view === "today" ? "Nothing for today" : "No active tasks"}
            </Text>
          ) : null}

          {visibleTasks.map((task) => (
            <TaskItem
              key={task.id}
              onDelete={() => deleteTaskMutation.mutate(task.id)}
              onPress={() => openUpdateDrawer(task)}
              onMoveToBacklog={
                view === "today"
                  ? () =>
                      moveTaskMutation.mutate({
                        id: task.id,
                        scheduledDate: null,
                      })
                  : undefined
              }
              onMoveToToday={
                view === "backlog"
                  ? () =>
                      moveTaskMutation.mutate({
                        id: task.id,
                        scheduledDate: today,
                      })
                  : undefined
              }
              onToggle={() => toggleTaskMutation.mutate(task.id)}
              task={task}
              today={today}
            />
          ))}
          <View
            className="min-h-24 flex-1"
            {...screenPanResponder.panHandlers}
          />
        </ScrollView>
      </View>

      <FloatingAddButton
        accessibilityLabel="Create new task"
        onPress={openCreateDrawer}
      />

      <ItemDrawer
        deletePending={deleteTaskMutation.isPending}
        error={error}
        focusOnOpen={drawer?.mode === "create"}
        initialFocusRef={titleInputRef}
        onClose={() => {
          setDrawer(null);
          setError(null);
        }}
        onDelete={
          drawer?.mode === "update"
            ? () => deleteTaskMutation.mutate(drawer.id)
            : undefined
        }
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
          autoCapitalize="sentences"
          keyboardType="email-address"
          onChangeText={updateTaskTitle}
          placeholder="Task title  #tag  @tag  /folder  !1-3"
          placeholderTextColor="#a3a3a3"
          value={drawer?.input.title ?? ""}
        />

        {drawerCommands.tags.length > 0 ||
        drawer?.input.folderName ||
        drawer?.input.priority !== "NONE" ? (
          <View className="flex-row flex-wrap gap-1.5">
            {drawerCommands.tags.map((tag) => (
              <Text
                key={tag}
                className="rounded-full bg-black px-2 py-1 text-xs font-semibold text-white"
              >
                #{tag}
              </Text>
            ))}
            {drawer?.input.folderName ? (
              <Pressable
                className="rounded-full bg-blue-600 px-2 py-1"
                onPress={() =>
                  updateDrawerInput(setDrawer, {
                    folderName: "",
                    title: removeFolderCommand(drawer.input.title),
                  })
                }
              >
                <Text className="text-xs font-semibold text-white">
                  /
                  {drawerCommands.folderToken ??
                    getFolderCommand(drawer.input.folderName)}{" "}
                  ×
                </Text>
              </Pressable>
            ) : null}
            {drawer?.input.priority !== "NONE" ? (
              <Pressable
                className="rounded-full bg-red-100 px-2 py-1"
                onPress={() =>
                  updateDrawerInput(setDrawer, {
                    priority: "NONE",
                    title: removePriorityCommand(drawer?.input.title ?? ""),
                  })
                }
              >
                <Text className="text-xs font-semibold text-red-700">
                  !
                  {drawerCommands.priorityCommand ??
                    getPriorityCommand(drawer?.input.priority ?? "NONE")}{" "}
                  · {formatPriority(drawer?.input.priority ?? "NONE")} ×
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <TextInput
          className="min-h-20 rounded bg-neutral-100 px-3 py-3 text-black"
          multiline
          onChangeText={(description) =>
            updateDrawerInput(setDrawer, { description })
          }
          placeholder="Description"
          placeholderTextColor="#a3a3a3"
          textAlignVertical="top"
          value={drawer?.input.description ?? ""}
        />

        <Pressable
          accessibilityRole="switch"
          accessibilityState={{
            checked: drawer?.input.scheduledDate === today,
          }}
          className="flex-row items-center justify-between rounded bg-neutral-100 px-3 py-3"
          onPress={() =>
            updateDrawerInput(setDrawer, {
              scheduledDate:
                drawer?.input.scheduledDate === today ? null : today,
            })
          }
        >
          <Text className="font-semibold text-black">Today</Text>
          <View
            className={`h-6 w-10 justify-center rounded-full p-1 ${
              drawer?.input.scheduledDate === today
                ? "items-end bg-black"
                : "items-start bg-neutral-300"
            }`}
          >
            <View className="h-4 w-4 rounded-full bg-white" />
          </View>
        </Pressable>

        <DatePicker
          onChange={(deadline) => updateDrawerInput(setDrawer, { deadline })}
          value={drawer?.input.deadline ?? null}
        />
      </ItemDrawer>
    </View>
  );
}

function FilterDropdown({
  activeFilter,
  folders,
  onClose,
  onHistory,
  onSelect,
  tags,
  visible,
}: {
  activeFilter: TaskFilter;
  folders: Folder[];
  onClose: () => void;
  onHistory: () => void;
  onSelect: (filter: TaskFilter) => void;
  tags: string[];
  visible: boolean;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View className="flex-1 bg-black/30 px-4 pt-24">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="max-h-[75%] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-lg">
          <View className="flex-row items-center justify-between border-b border-neutral-100 px-4 py-3">
            <View>
              <Text className="text-lg font-bold text-black">Task view</Text>
              <Text className="text-xs text-neutral-500">
                Filter by folder or tag
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close task filter"
              className="h-8 w-8 items-center justify-center rounded-full bg-neutral-100"
              onPress={onClose}
            >
              <Text className="text-base font-semibold text-neutral-600">
                ×
              </Text>
            </Pressable>
          </View>
          <ScrollView className="px-2 py-2">
            <FolderOption
              active={activeFilter === null}
              icon="≡"
              label="All"
              onPress={() => onSelect(null)}
            />

            {folders.length > 0 ? (
              <>
                <Text className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Folders
                </Text>
                {folders.map((folder) => (
                  <FolderOption
                    key={folder.id}
                    active={
                      activeFilter?.type === "folder" &&
                      activeFilter.id === folder.id
                    }
                    icon="/"
                    label={folder.name}
                    onPress={() =>
                      onSelect({
                        type: "folder",
                        id: folder.id,
                        label: folder.name,
                      })
                    }
                  />
                ))}
              </>
            ) : null}

            {tags.length > 0 ? (
              <>
                <Text className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Tags
                </Text>
                {tags.map((tag) => (
                  <FolderOption
                    key={tag}
                    active={
                      activeFilter?.type === "tag" && activeFilter.label === tag
                    }
                    icon="#"
                    label={tag}
                    onPress={() => onSelect({ type: "tag", label: tag })}
                  />
                ))}
              </>
            ) : null}
          </ScrollView>
          <View className="border-t border-neutral-100 p-2">
            <FolderOption
              active={false}
              icon="↺"
              label="History"
              onPress={onHistory}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FolderOption({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      className={`flex-row items-center justify-between rounded-xl px-3 py-3 ${
        active ? "bg-black" : "bg-white"
      }`}
      onPress={onPress}
    >
      <View className="flex-row items-center gap-3">
        <View
          className={`h-8 w-8 items-center justify-center rounded-lg ${active ? "bg-white/15" : "bg-neutral-100"}`}
        >
          <Text
            className={`font-bold ${active ? "text-white" : "text-neutral-500"}`}
          >
            {icon}
          </Text>
        </View>
        <Text
          className={`font-semibold ${active ? "text-white" : "text-black"}`}
        >
          {label}
        </Text>
      </View>
      {active ? <Text className="font-semibold text-white">✓</Text> : null}
    </Pressable>
  );
}

function updateDrawerInput(
  setDrawer: React.Dispatch<React.SetStateAction<TaskDrawerState | null>>,
  input: Partial<TaskInput>,
) {
  setDrawer((current) =>
    current ? { ...current, input: { ...current.input, ...input } } : current,
  );
}

function isTaskForToday(task: TaskWithCompletion, today: string) {
  return task.scheduledDate !== null && task.scheduledDate <= today;
}

function resolveFolderCommand(folderToken: string, folders: Folder[]) {
  return (
    folders.find((folder) => getFolderCommand(folder.name) === folderToken)
      ?.name ?? folderToken
  );
}

function getPriorityCommand(priority: TaskPriority) {
  return {
    HIGH: "3",
    MEDIUM: "2",
    LOW: "1",
    NONE: null,
  }[priority];
}

function formatPriority(priority: TaskPriority) {
  return `${priority.charAt(0)}${priority.slice(1).toLowerCase()} priority`;
}

function invalidateTaskQueries(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["getTasksWithCompletion"] }),
    queryClient.invalidateQueries({ queryKey: ["getAllFolders"] }),
  ]);
}
