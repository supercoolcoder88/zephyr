import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { z } from "zod";

import { createTask, type CreateTaskInput } from "../../../db/task";

const createTaskInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z
    .string()
    .trim()
    .transform((description) => (description.length > 0 ? description : null))
    .optional(),
  deadline: z
    .string()
    .trim()
    .transform((deadline) => (deadline.length > 0 ? deadline : null))
    .optional(),
});

export default function CreateTaskScreen() {
  const database = useSQLiteContext();
  const queryClient = useQueryClient();
  const [input, setInput] = useState<CreateTaskInput>({
    title: "",
    description: "",
    deadline: "",
  });
  const [error, setError] = useState<string | null>(null);

  const createQuery = useMutation({
    mutationFn: (input: CreateTaskInput) => {
      const task = createTaskInputSchema.parse(input);
      return createTask(database, task);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["getTasks"] });
      router.dismissTo("/task");
    },
  });

  async function handleSubmit() {
    setError(null);

    try {
      await createQuery.mutateAsync(input);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0]?.message ?? "Invalid task");
        return;
      }

      setError("Unable to create task.");
    }
  }

  return (
    <View className="flex-1 gap-4 bg-gray-50 p-5 pt-8">
      <TextInput
        autoFocus
        className="rounded border border-gray-200 bg-white px-3 py-3 text-gray-950"
        onChangeText={(title) => setInput((current) => ({ ...current, title }))}
        placeholder="Task title"
        placeholderTextColor="#9ca3af"
        value={input.title}
      />

      <TextInput
        className="min-h-24 rounded border border-gray-200 bg-white px-3 py-3 text-gray-950"
        multiline
        onChangeText={(description) =>
          setInput((current) => ({ ...current, description }))
        }
        placeholder="Description"
        placeholderTextColor="#9ca3af"
        textAlignVertical="top"
        value={input.description ?? ""}
      />

      <TextInput
        className="rounded border border-gray-200 bg-white px-3 py-3 text-gray-950"
        onChangeText={(deadline) =>
          setInput((current) => ({ ...current, deadline }))
        }
        placeholder="Deadline"
        placeholderTextColor="#9ca3af"
        value={input.deadline ?? ""}
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
