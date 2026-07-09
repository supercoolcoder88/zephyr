import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { z } from "zod";

import { createHabit, type CreateHabitInput } from "../../../db/habit";

const createHabitInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  score: z
    .number()
    .int()
    .min(1, "1 <= score <= 10")
    .max(10, "1 <= score <= 10"),
});

export default function CreateHabitScreen() {
  const database = useSQLiteContext();
  const queryClient = useQueryClient();
  const [input, setInput] = useState<CreateHabitInput>({
    title: "",
    score: 1,
  });
  const [error, setError] = useState<string | null>(null);

  const createQuery = useMutation({
    mutationFn: (input: CreateHabitInput) => {
      const habit = createHabitInputSchema.parse(input);
      return createHabit(database, habit);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["getHabits"] }),
        queryClient.invalidateQueries({
          queryKey: ["getHabitsWithCompletion"],
        }),
      ]);
      router.dismissTo("/habit");
    },
  });

  async function handleSubmit() {
    setError(null);

    try {
      await createQuery.mutateAsync(input);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0]?.message ?? "Invalid habit");
        return;
      }

      setError("Unable to create habit.");
    }
  }

  return (
    <View className="flex-1 gap-4 bg-gray-50 p-5 pt-8">
      <TextInput
        autoFocus
        className="rounded border border-gray-200 bg-white px-3 py-3 text-gray-950"
        onChangeText={(title) => setInput((current) => ({ ...current, title }))}
        placeholder="Habit title"
        placeholderTextColor="#9ca3af"
        value={input.title}
      />

      <TextInput
        className="rounded border border-gray-200 bg-white px-3 py-3 text-gray-950"
        keyboardType="number-pad"
        onChangeText={(score) => {
          const nextScore = Number(score);

          setInput((current) => ({
            ...current,
            score: Number.isNaN(nextScore) ? 1 : nextScore,
          }));
        }}
        placeholder="Score, 1 to 10"
        placeholderTextColor="#9ca3af"
        value={String(input.score)}
      />

      {error ? <Text className="text-gray-500">{error}</Text> : null}

      <Pressable
        className="rounded bg-blue-950 px-4 py-3"
        disabled={createQuery.isPending}
        onPress={handleSubmit}
      >
        <Text className="text-center text-white">
          {createQuery.isPending ? "Saving..." : "Submit"}
        </Text>
      </Pressable>
    </View>
  );
}
