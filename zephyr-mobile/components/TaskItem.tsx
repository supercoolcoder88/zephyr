import { useRef } from "react";
import { Animated, PanResponder, Pressable, Text, View } from "react-native";

import type { TaskPriority, TaskWithCompletion } from "../db/task";
import { formatDateKeyForDisplay } from "../utils/date";
import { getTaskDisplayTitle } from "../utils/taskTags";

type TaskItemProps = {
  onDelete?: () => void;
  onMoveToBacklog?: () => void;
  onMoveToToday?: () => void;
  onPress?: () => void;
  onToggle: () => void;
  task: TaskWithCompletion;
  today: string;
};

const priorityClasses: Record<TaskPriority, string> = {
  NONE: "border-neutral-200 bg-white",
  LOW: "border-red-200 bg-red-50",
  MEDIUM: "border-red-300 bg-red-100",
  HIGH: "border-red-700 bg-red-600",
};

export default function TaskItem({
  onDelete,
  onMoveToBacklog,
  onMoveToToday,
  onPress,
  onToggle,
  task,
  today,
}: TaskItemProps) {
  const completed = task.status === "COMPLETE";
  const deadlineLabel = getDeadlineLabel(task.deadline, today);
  const translateX = useRef(new Animated.Value(0)).current;
  const gestureCallbacks = useRef({
    onSwipeLeft: onMoveToBacklog ?? onDelete,
    onSwipeRight: onMoveToToday ?? onDelete,
  });
  gestureCallbacks.current = {
    onSwipeLeft: onMoveToBacklog ?? onDelete,
    onSwipeRight: onMoveToToday ?? onDelete,
  };
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        shouldHandleSwipe(gesture.dx, gesture.dy, gestureCallbacks.current),
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        shouldHandleSwipe(gesture.dx, gesture.dy, gestureCallbacks.current),
      onPanResponderMove: (_event, gesture) => {
        translateX.setValue(Math.max(-112, Math.min(112, gesture.dx)));
      },
      onPanResponderRelease: (_event, gesture) => {
        finishSwipe(gesture.dx, gestureCallbacks.current, translateX);
      },
      onPanResponderTerminate: (_event, gesture) => {
        finishSwipe(gesture.dx, gestureCallbacks.current, translateX);
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  return (
    <View className="relative overflow-hidden border-b border-neutral-100 bg-neutral-100">
      <View
        className={`absolute inset-y-0 left-0 w-28 justify-center px-4 ${
          onMoveToToday ? "bg-blue-600" : "bg-red-600"
        }`}
      >
        <Text className="font-bold text-white">
          {onMoveToToday ? "Today" : "Delete"}
        </Text>
      </View>
      <View
        className={`absolute inset-y-0 right-0 w-28 items-end justify-center px-4 ${
          onMoveToBacklog ? "bg-neutral-700" : "bg-red-600"
        }`}
      >
        <Text className="font-bold text-white">
          {onMoveToBacklog ? "Backlog" : "Delete"}
        </Text>
      </View>

      <Animated.View
        className="bg-white"
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        <Pressable className="bg-white py-3" onPress={onPress}>
          <View className="flex-row items-start gap-3">
            {task.priority !== "NONE" ? (
              <View
                className={`min-w-9 items-center rounded border px-1.5 py-1 ${priorityClasses[task.priority]}`}
              >
                <Text
                  className={`text-xs font-black ${
                    task.priority === "HIGH" ? "text-white" : "text-red-600"
                  }`}
                >
                  {getPriorityMarks(task.priority)}
                </Text>
              </View>
            ) : null}

            <View className="flex-1 gap-1.5">
              <Text
                className={`text-base font-semibold ${
                  completed ? "text-neutral-400" : "text-black"
                }`}
              >
                {getTaskDisplayTitle(task.title)}
              </Text>

              {task.tags.length > 0 || task.folderName ? (
                <View className="flex-row flex-wrap items-center gap-1.5">
                  {task.folderName ? (
                    <Text className="text-xs font-semibold text-blue-700">
                      {task.folderName}
                    </Text>
                  ) : null}
                  {task.tags.map((tag) => (
                    <Text
                      key={tag}
                      className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-600"
                    >
                      @{tag}
                    </Text>
                  ))}
                </View>
              ) : null}

              {deadlineLabel ? (
                <Text
                  className={`text-xs font-semibold ${
                    task.deadline && task.deadline < today && !completed
                      ? "text-red-600"
                      : "text-neutral-500"
                  }`}
                >
                  {deadlineLabel}
                </Text>
              ) : null}
              {completed && task.statusDate ? (
                <Text className="text-xs font-semibold text-neutral-400">
                  Completed {formatDateKeyForDisplay(task.statusDate)}
                </Text>
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
                completed ? "border-black bg-black" : "border-neutral-300"
              }`}
              onPress={onToggle}
            >
              {completed ? <View className="h-3 w-3 rounded bg-white" /> : null}
            </Pressable>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function shouldHandleSwipe(
  dx: number,
  dy: number,
  callbacks: {
    onSwipeLeft?: () => void;
    onSwipeRight?: () => void;
  },
) {
  return (
    Math.abs(dx) > 8 &&
    Math.abs(dx) > Math.abs(dy) &&
    Boolean(dx > 0 ? callbacks.onSwipeRight : callbacks.onSwipeLeft)
  );
}

function finishSwipe(
  dx: number,
  callbacks: {
    onSwipeLeft?: () => void;
    onSwipeRight?: () => void;
  },
  translateX: Animated.Value,
) {
  if (dx >= 72) {
    callbacks.onSwipeRight?.();
  } else if (dx <= -72) {
    callbacks.onSwipeLeft?.();
  }

  resetSwipe(translateX);
}

function resetSwipe(translateX: Animated.Value) {
  Animated.spring(translateX, {
    friction: 7,
    tension: 70,
    toValue: 0,
    useNativeDriver: true,
  }).start();
}

function getPriorityMarks(priority: TaskPriority) {
  return {
    HIGH: "!!!",
    MEDIUM: "!!",
    LOW: "!",
    NONE: "",
  }[priority];
}

function getDeadlineLabel(deadline: string | null, today: string) {
  if (!deadline) {
    return null;
  }

  if (deadline < today) {
    return `Overdue · ${formatDateKeyForDisplay(deadline)}`;
  }

  if (deadline === today) {
    return "Due today";
  }

  return `Due ${formatDateKeyForDisplay(deadline)}`;
}
