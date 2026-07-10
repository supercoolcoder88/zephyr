import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { z } from "zod";

import ItemDrawer from "../../../components/ItemDrawer";
import {
  createTracker,
  deleteTracker,
  getTrackersWithLog,
  updateTracker,
  upsertTrackerLogCount,
  type CreateTrackerInput,
  type TrackerWithLog,
  type UpdateTrackerInput,
} from "../../../db/tracker";

const trackerInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

type TrackerInput = {
  name: string;
};

type TrackerDrawerState =
  | {
      mode: "create";
      input: TrackerInput;
    }
  | {
      mode: "update";
      id: number;
      input: TrackerInput;
    };

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function TrackersScreen() {
  const database = useSQLiteContext();
  const queryClient = useQueryClient();
  const today = getLocalDateKey();
  const nameInputRef = useRef<TextInput>(null);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [drawer, setDrawer] = useState<TrackerDrawerState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trackersQuery = useQuery({
    queryKey: ["getTrackersWithLog", today],
    queryFn: () => getTrackersWithLog(database, today),
  });

  useEffect(() => {
    if (!trackersQuery.data) {
      return;
    }

    setCounts(
      Object.fromEntries(
        trackersQuery.data.map((tracker) => [
          tracker.id,
          tracker.count === 0 ? "" : String(tracker.count),
        ]),
      ),
    );
  }, [trackersQuery.data]);

  const createTrackerMutation = useMutation({
    mutationFn: (input: CreateTrackerInput) => createTracker(database, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["getTrackersWithLog", today],
      });
      setDrawer(null);
    },
  });

  const updateTrackerMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateTrackerInput }) =>
      updateTracker(database, id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["getTrackersWithLog", today],
      });
      setDrawer(null);
    },
  });

  const deleteTrackerMutation = useMutation({
    mutationFn: (id: number) => deleteTracker(database, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["getTrackersWithLog", today],
      });
      setDrawer(null);
    },
  });

  const updateTrackerLogMutation = useMutation({
    mutationFn: ({ trackerId, count }: { trackerId: number; count: number }) =>
      upsertTrackerLogCount(database, trackerId, today, count),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["getTrackersWithLog", today],
        }),
        queryClient.invalidateQueries({
          queryKey: ["getOrCreateDailyReviewByDate", today],
        }),
      ]);
    },
  });

  function openCreateDrawer() {
    setDrawer({ mode: "create", input: { name: "" } });
    setError(null);
  }

  function openUpdateDrawer(tracker: TrackerWithLog) {
    setDrawer({
      mode: "update",
      id: tracker.id,
      input: { name: tracker.name },
    });
    setError(null);
  }

  async function handleSubmit() {
    if (!drawer) {
      return;
    }

    setError(null);

    try {
      const input = trackerInputSchema.parse(drawer.input);

      if (drawer.mode === "create") {
        await createTrackerMutation.mutateAsync(input);
      } else {
        await updateTrackerMutation.mutateAsync({ id: drawer.id, input });
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0]?.message ?? "Invalid tracker");
        return;
      }

      setError("Unable to save tracker.");
    }
  }

  function updateCount(trackerId: number, value: string) {
    if (!/^\d*$/.test(value)) {
      return;
    }

    setCounts((current) => ({ ...current, [trackerId]: value }));
    updateTrackerLogMutation.mutate({
      trackerId,
      count: value.length === 0 ? 0 : Number(value),
    });
  }

  const trackers = trackersQuery.data ?? [];

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-28 pt-4"
      >
        {trackersQuery.isLoading ? (
          <Text className="text-gray-400">Loading trackers...</Text>
        ) : null}
        {trackersQuery.isError ? (
          <Text className="text-gray-500">Unable to load trackers.</Text>
        ) : null}
        {!trackersQuery.isLoading && trackers.length === 0 ? (
          <View className="rounded border border-gray-100 bg-white px-4 py-8">
            <Text className="text-center font-semibold text-gray-950">
              No trackers yet
            </Text>
          </View>
        ) : null}

        {trackers.map((tracker) => (
          <View
            key={tracker.id}
            className="mb-3 flex-row items-center gap-3 rounded border border-gray-200 bg-white px-4 py-3 shadow-sm"
          >
            <Pressable
              className="flex-1 py-2"
              onPress={() => openUpdateDrawer(tracker)}
            >
              <Text className="text-base font-semibold text-gray-950">
                {tracker.name}
              </Text>
            </Pressable>
            <TextInput
              className="w-24 rounded border border-gray-200 bg-gray-50 px-3 py-3 text-center text-gray-950"
              keyboardType="number-pad"
              onChangeText={(value) => updateCount(tracker.id, value)}
              placeholder="0"
              placeholderTextColor="#9ca3af"
              value={counts[tracker.id] ?? ""}
            />
          </View>
        ))}
      </ScrollView>

      <Pressable
        accessibilityLabel="Create new tracker"
        className="absolute bottom-6 right-5 h-14 w-14 items-center justify-center rounded-full bg-blue-950 shadow-lg"
        onPress={openCreateDrawer}
      >
        <Text className="text-3xl font-light leading-8 text-white">+</Text>
      </Pressable>

      <ItemDrawer
        deletePending={deleteTrackerMutation.isPending}
        error={error}
        initialFocusRef={nameInputRef}
        onClose={() => {
          setDrawer(null);
          setError(null);
        }}
        onDelete={
          drawer?.mode === "update"
            ? () => deleteTrackerMutation.mutate(drawer.id)
            : undefined
        }
        onSubmit={handleSubmit}
        submitLabel={
          drawer?.mode === "update" ? "Save tracker" : "Create tracker"
        }
        submitPending={
          createTrackerMutation.isPending || updateTrackerMutation.isPending
        }
        title={drawer?.mode === "update" ? "Edit tracker" : "New tracker"}
        visible={drawer !== null}
      >
        <TextInput
          autoFocus
          ref={nameInputRef}
          className="rounded border border-gray-200 bg-gray-50 px-3 py-3 text-gray-950"
          onChangeText={(name) =>
            setDrawer((current) =>
              current
                ? { ...current, input: { ...current.input, name } }
                : current,
            )
          }
          placeholder="Tracker name"
          placeholderTextColor="#9ca3af"
          value={drawer?.input.name ?? ""}
        />
      </ItemDrawer>
    </View>
  );
}
