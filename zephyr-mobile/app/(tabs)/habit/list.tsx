import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSQLiteContext } from "expo-sqlite";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { z } from "zod";

import {
  deleteHabit,
  getAllHabits,
  updateHabit,
  type Habit,
  type UpdateHabitInput,
} from "../../../db/habit";

const updateHabitInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  score: z
    .number()
    .int()
    .min(1, "1 <= score <= 10")
    .max(10, "1 <= score <= 10"),
});

type EditingHabit = {
  id: number;
  title: string;
  score: string;
};

function toEditingHabit(habit: Habit): EditingHabit {
  return {
    id: habit.id,
    title: habit.title,
    score: String(habit.score),
  };
}

export default function HabitListScreen() {
  const database = useSQLiteContext();
  const queryClient = useQueryClient();
  const [editingHabit, setEditingHabit] = useState<EditingHabit | null>(null);
  const [deletingHabitId, setDeletingHabitId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const habitsQuery = useQuery({
    queryKey: ["getHabits"],
    queryFn: () => getAllHabits(database),
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
      ]);
      setEditingHabit(null);
      setDeletingHabitId(null);
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
      ]);
      setEditingHabit(null);
      setDeletingHabitId(null);
    },
  });

  async function handleSave() {
    if (!editingHabit) {
      return;
    }

    setError(null);

    try {
      const input = updateHabitInputSchema.parse({
        title: editingHabit.title,
        score: Number(editingHabit.score),
      });

      await updateHabitMutation.mutateAsync({
        id: editingHabit.id,
        input,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0]?.message ?? "Invalid habit");
        return;
      }

      setError("Unable to update habit.");
    }
  }

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

      {habits.map((habit) => {
        const isEditing = editingHabit?.id === habit.id;
        const isDeleting = deletingHabitId === habit.id;

        return (
          <View
            key={habit.id}
            className="mb-3 rounded border border-gray-200 bg-white shadow-sm"
          >
            {isDeleting ? (
              <View className="p-4">
                <View className="flex-row items-center">
                  <View className="mr-4 h-10 w-10 items-center justify-center rounded bg-gray-100">
                    <Text className="text-sm font-semibold text-gray-400">
                      {habit.score}
                    </Text>
                  </View>
                  <Text className="flex-1 text-base font-semibold text-gray-950">
                    Delete {habit.title}?
                  </Text>
                </View>
                <View className="mt-4 flex-row gap-2">
                  <Pressable
                    className="flex-1 rounded border border-gray-200 px-3 py-3"
                    onPress={() => setDeletingHabitId(null)}
                  >
                    <Text className="text-center font-semibold text-blue-950">
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    className="flex-1 rounded bg-red-700 px-3 py-3"
                    disabled={deleteHabitMutation.isPending}
                    onPress={() => deleteHabitMutation.mutate(habit.id)}
                  >
                    <Text className="text-center font-semibold text-white">
                      Confirm
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : isEditing && editingHabit ? (
              <View className="gap-3 p-4">
                <View className="flex-row gap-3">
                  <TextInput
                    className="w-16 rounded border border-gray-200 bg-gray-50 px-3 py-3 text-center text-gray-950"
                    keyboardType="number-pad"
                    onChangeText={(score) =>
                      setEditingHabit((current) =>
                        current ? { ...current, score } : current,
                      )
                    }
                    placeholder="1"
                    placeholderTextColor="#9ca3af"
                    value={editingHabit.score}
                  />
                  <TextInput
                    className="flex-1 rounded border border-gray-200 bg-gray-50 px-3 py-3 text-gray-950"
                    onChangeText={(title) =>
                      setEditingHabit((current) =>
                        current ? { ...current, title } : current,
                      )
                    }
                    placeholder="Habit title"
                    placeholderTextColor="#9ca3af"
                    value={editingHabit.title}
                  />
                </View>
                {error ? (
                  <Text className="text-sm text-gray-500">{error}</Text>
                ) : null}
                <View className="flex-row gap-2">
                  <Pressable
                    className="flex-1 rounded border border-gray-200 px-3 py-3"
                    onPress={() => {
                      setEditingHabit(null);
                      setDeletingHabitId(null);
                      setError(null);
                    }}
                  >
                    <Text className="text-center font-semibold text-blue-950">
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    className="flex-1 rounded bg-blue-950 px-3 py-3"
                    disabled={updateHabitMutation.isPending}
                    onPress={handleSave}
                  >
                    <Text className="text-center font-semibold text-white">
                      {updateHabitMutation.isPending ? "Saving..." : "Save"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View className="p-4">
                <View className="flex-row items-center">
                  <View className="mr-4 h-10 w-10 items-center justify-center rounded bg-gray-100">
                    <Text className="text-sm font-semibold text-gray-400">
                      {habit.score}
                    </Text>
                  </View>
                  <Text className="flex-1 text-base font-semibold text-gray-950">
                    {habit.title}
                  </Text>
                </View>
                <View className="mt-4 flex-row gap-2 border-t border-gray-100 pt-3">
                  <Pressable
                    className="flex-1 rounded border border-gray-200 px-3 py-3"
                    onPress={() => {
                      setEditingHabit(toEditingHabit(habit));
                      setDeletingHabitId(null);
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
                      setEditingHabit(null);
                      setDeletingHabitId(habit.id);
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
