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
    <View className="flex-1 gap-4 bg-white p-5 pt-8">
      <TextInput
        autoFocus
        className="rounded bg-neutral-100 px-3 py-3 text-black"
        onChangeText={(title) => setInput((current) => ({ ...current, title }))}
        placeholder="Task title"
        placeholderTextColor="#a3a3a3"
        value={input.title}
      />

      <TextInput
        className="min-h-24 rounded bg-neutral-100 px-3 py-3 text-black"
        multiline
        onChangeText={(description) =>
          setInput((current) => ({ ...current, description }))
        }
        placeholder="Description"
        placeholderTextColor="#a3a3a3"
        textAlignVertical="top"
        value={input.description ?? ""}
      />

      <TextInput
        className="rounded bg-neutral-100 px-3 py-3 text-black"
        onChangeText={(deadline) =>
          setInput((current) => ({ ...current, deadline }))
        }
        placeholder="Deadline"
        placeholderTextColor="#a3a3a3"
        value={input.deadline ?? ""}
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
