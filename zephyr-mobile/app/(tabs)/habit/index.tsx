import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSQLiteContext } from "expo-sqlite";
import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { z } from "zod";

import HabitItem from "../../../components/HabitItem/HabitItem";
import ItemDrawer from "../../../components/ItemDrawer";
import {
  createHabit,
  deleteHabit,
  getHabitsWithCompletion,
  updateHabit,
  type CreateHabitInput,
  type HabitWithCompletion,
  type UpdateHabitInput,
} from "../../../db/habit";
import { updateHabitLogStatus } from "../../../db/habitLog";
import { getLocalDateKey } from "../../../utils/date";

const habitInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  score: z
    .string()
    .trim()
    .transform((score) => Number(score))
    .refine((score) => Number.isInteger(score) && score >= 1 && score <= 10, {
      message: "1 <= score <= 10",
    }),
});

type HabitInput = {
  title: string;
  score: string;
};

type HabitDrawerState =
  | {
      mode: "create";
      input: HabitInput;
    }
  | {
      mode: "update";
      id: number;
      input: HabitInput;
    };

export default function HabitScreen() {
  const database = useSQLiteContext();
  const queryClient = useQueryClient();
  const today = getLocalDateKey();
  const [drawer, setDrawer] = useState<HabitDrawerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const titleInputRef = useRef<TextInput>(null);

  function openCreateDrawer() {
    setDrawer({ mode: "create", input: { title: "", score: "1" } });
    setError(null);
  }

  function openUpdateDrawer(habit: HabitWithCompletion) {
    setDrawer({
      mode: "update",
      id: habit.id,
      input: { title: habit.title, score: String(habit.score) },
    });
    setError(null);
  }

  const habitsQuery = useQuery({
    queryKey: ["getHabitsWithCompletion", today],
    queryFn: () => getHabitsWithCompletion(database, today),
  });

  const toggleHabitMutation = useMutation({
    mutationFn: (habitId: number) =>
      updateHabitLogStatus(database, habitId, today),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["getHabitsWithCompletion", today],
        }),
        queryClient.invalidateQueries({
          queryKey: ["getOrCreateDailyReviewByDate"],
        }),
        queryClient.invalidateQueries({ queryKey: ["getAllDailyReviews"] }),
      ]);
    },
  });

  const createHabitMutation = useMutation({
    mutationFn: (input: CreateHabitInput) => createHabit(database, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["getHabits"] }),
        queryClient.invalidateQueries({
          queryKey: ["getHabitsWithCompletion"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["getOrCreateDailyReviewByDate"],
        }),
        queryClient.invalidateQueries({ queryKey: ["getAllDailyReviews"] }),
      ]);
      setDrawer(null);
    },
  });

  const updateHabitMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateHabitInput }) =>
      updateHabit(database, id, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["getHabits"] }),
        queryClient.invalidateQueries({
          queryKey: ["getHabitsWithCompletion"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["getOrCreateDailyReviewByDate"],
        }),
        queryClient.invalidateQueries({ queryKey: ["getAllDailyReviews"] }),
      ]);
      setDrawer(null);
    },
  });

  const deleteHabitMutation = useMutation({
    mutationFn: (id: number) => deleteHabit(database, id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["getHabits"] }),
        queryClient.invalidateQueries({
          queryKey: ["getHabitsWithCompletion"],
        }),
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
      const input = habitInputSchema.parse(drawer.input);

      if (drawer.mode === "create") {
        await createHabitMutation.mutateAsync(input);
      } else {
        await updateHabitMutation.mutateAsync({ id: drawer.id, input });
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0]?.message ?? "Invalid habit");
        return;
      }

      setError("Unable to save habit.");
    }
  }

  const habits = habitsQuery.data ?? [];
  const activeHabits = habits.filter((habit) => habit.status !== "COMPLETE");
  const completedHabits = habits.filter((habit) => habit.status === "COMPLETE");

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-28 pt-4"
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
          </View>
        ) : null}

        {activeHabits.map((habit) => (
          <HabitItem
            key={habit.id}
            completed={false}
            onPress={() => openUpdateDrawer(habit)}
            onToggle={() => toggleHabitMutation.mutate(habit.id)}
            score={habit.score}
            title={habit.title}
          />
        ))}

        {completedHabits.length > 0 ? (
          <View className="mt-2">
            <Pressable
              className="mb-3 flex-row items-center justify-between rounded border border-gray-200 bg-white px-4 py-3"
              onPress={() => setShowCompleted((current) => !current)}
            >
              <Text className="font-semibold text-gray-950">
                Completed ({completedHabits.length})
              </Text>
              <Text className="text-lg font-semibold text-gray-400">
                {showCompleted ? "-" : "+"}
              </Text>
            </Pressable>
            {showCompleted
              ? completedHabits.map((habit) => (
                  <HabitItem
                    key={habit.id}
                    completed
                    onPress={() => openUpdateDrawer(habit)}
                    onToggle={() => toggleHabitMutation.mutate(habit.id)}
                    score={habit.score}
                    title={habit.title}
                  />
                ))
              : null}
          </View>
        ) : null}
      </ScrollView>

      <Pressable
        accessibilityLabel="Create new habit"
        className="absolute bottom-6 right-5 h-14 w-14 items-center justify-center rounded-full bg-blue-950 shadow-lg"
        onPress={openCreateDrawer}
      >
        <Text className="text-3xl font-light leading-8 text-white">+</Text>
      </Pressable>

      <ItemDrawer
        deletePending={deleteHabitMutation.isPending}
        error={error}
        onClose={() => {
          setDrawer(null);
          setError(null);
        }}
        onDelete={
          drawer?.mode === "update"
            ? () => deleteHabitMutation.mutate(drawer.id)
            : undefined
        }
        initialFocusRef={titleInputRef}
        onSubmit={handleSubmit}
        submitLabel={drawer?.mode === "update" ? "Save habit" : "Create habit"}
        submitPending={
          createHabitMutation.isPending || updateHabitMutation.isPending
        }
        title={drawer?.mode === "update" ? "Edit habit" : "New habit"}
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
          placeholder="Habit title"
          placeholderTextColor="#9ca3af"
          value={drawer?.input.title ?? ""}
        />
        <TextInput
          className="rounded border border-gray-200 bg-gray-50 px-3 py-3 text-gray-950"
          keyboardType="number-pad"
          onChangeText={(score) =>
            setDrawer((current) =>
              current
                ? { ...current, input: { ...current.input, score } }
                : current,
            )
          }
          placeholder="Score, 1 to 10"
          placeholderTextColor="#9ca3af"
          value={drawer?.input.score ?? ""}
        />
      </ItemDrawer>
    </View>
  );
}
