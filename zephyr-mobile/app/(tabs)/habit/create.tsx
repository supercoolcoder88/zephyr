import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { z } from "zod";

import { createHabit, type CreateHabitInput } from "../../../db/habit";

const createHabitInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
});

export default function CreateHabitScreen() {
  const database = useSQLiteContext();
  const queryClient = useQueryClient();
  const [input, setInput] = useState<CreateHabitInput>({
    title: "",
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
    <View className="flex-1 gap-4 bg-white p-5 pt-8">
      <TextInput
        autoFocus
        className="rounded bg-neutral-100 px-3 py-3 text-black"
        onChangeText={(title) => setInput((current) => ({ ...current, title }))}
        placeholder="Habit title"
        placeholderTextColor="#a3a3a3"
        value={input.title}
      />

      {error ? <Text className="text-neutral-500">{error}</Text> : null}

      <Pressable
        className="rounded bg-black px-4 py-3"
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
