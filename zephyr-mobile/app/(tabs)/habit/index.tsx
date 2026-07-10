import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSQLiteContext } from "expo-sqlite";
import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { z } from "zod";

import HabitItem from "../../../components/HabitItem/HabitItem";
import FloatingAddButton from "../../../components/FloatingAddButton";
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
import { getDisableEdits, getHideHabitAddButton } from "../../../db/settings";
import { getLocalDateKey } from "../../../utils/date";

const habitInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
});

type HabitInput = {
  title: string;
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
    setDrawer({ mode: "create", input: { title: "" } });
    setError(null);
  }

  function openUpdateDrawer(habit: HabitWithCompletion) {
    setDrawer({
      mode: "update",
      id: habit.id,
      input: { title: habit.title },
    });
    setError(null);
  }

  const habitsQuery = useQuery({
    queryKey: ["getHabitsWithCompletion", today],
    queryFn: () => getHabitsWithCompletion(database, today),
  });
  const hideAddButtonQuery = useQuery({
    queryKey: ["hideHabitAddButton"],
    queryFn: () => getHideHabitAddButton(database),
  });
  const disableEditsQuery = useQuery({
    queryKey: ["disableEdits"],
    queryFn: () => getDisableEdits(database),
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
    <View className="flex-1 bg-white">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-28 pt-4"
      >
        {habitsQuery.isLoading ? (
          <Text className="text-neutral-400">Loading habits...</Text>
        ) : null}
        {habitsQuery.isError ? (
          <Text className="text-neutral-500">Unable to load habits.</Text>
        ) : null}
        {!habitsQuery.isLoading && habits.length === 0 ? (
          <View className="bg-white py-8">
            <Text className="text-center font-semibold text-black">
              No habits yet
            </Text>
          </View>
        ) : null}

        {activeHabits.map((habit) => (
          <HabitItem
            key={habit.id}
            completed={false}
            onPress={
              disableEditsQuery.data ? undefined : () => openUpdateDrawer(habit)
            }
            onToggle={() => toggleHabitMutation.mutate(habit.id)}
            title={habit.title}
          />
        ))}

        {completedHabits.length > 0 ? (
          <View className="-mt-px">
            <Pressable
              className="-mx-5 flex-row items-center justify-between bg-neutral-100 px-5 py-3"
              onPress={() => setShowCompleted((current) => !current)}
            >
              <Text className="font-semibold text-neutral-500">
                Completed ({completedHabits.length})
              </Text>
              <Text className="text-lg font-semibold text-neutral-400">
                {showCompleted ? "-" : "+"}
              </Text>
            </Pressable>
            {showCompleted
              ? completedHabits.map((habit) => (
                  <HabitItem
                    key={habit.id}
                    completed
                    onPress={
                      disableEditsQuery.data
                        ? undefined
                        : () => openUpdateDrawer(habit)
                    }
                    onToggle={() => toggleHabitMutation.mutate(habit.id)}
                    title={habit.title}
                  />
                ))
              : null}
          </View>
        ) : null}
      </ScrollView>

      {hideAddButtonQuery.data === false ? (
        <FloatingAddButton
          accessibilityLabel="Create new habit"
          onPress={openCreateDrawer}
        />
      ) : null}

      <ItemDrawer
        deletePending={deleteHabitMutation.isPending}
        error={error}
        focusOnOpen={drawer?.mode === "create"}
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
          autoFocus={drawer?.mode === "create"}
          key={
            drawer?.mode === "update"
              ? `update-${drawer.id}`
              : (drawer?.mode ?? "closed")
          }
          ref={titleInputRef}
          className="rounded bg-neutral-100 px-3 py-3 text-black"
          onChangeText={(title) =>
            setDrawer((current) =>
              current
                ? { ...current, input: { ...current.input, title } }
                : current,
            )
          }
          placeholder="Habit title"
          placeholderTextColor="#a3a3a3"
          value={drawer?.input.title ?? ""}
        />
      </ItemDrawer>
    </View>
  );
}
