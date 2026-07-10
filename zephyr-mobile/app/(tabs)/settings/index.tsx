import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSQLiteContext } from "expo-sqlite";
import { Pressable, Text, View } from "react-native";

import {
  getDisableEdits,
  getHideHabitAddButton,
  getHideTrackerAddButton,
  setDisableEdits,
  setHideHabitAddButton,
  setHideTrackerAddButton,
} from "../../../db/settings";

export default function SettingsScreen() {
  const database = useSQLiteContext();
  const queryClient = useQueryClient();
  const habitSettingQuery = useQuery({
    queryKey: ["hideHabitAddButton"],
    queryFn: () => getHideHabitAddButton(database),
  });
  const habitSettingMutation = useMutation({
    mutationFn: (hidden: boolean) => setHideHabitAddButton(database, hidden),
    onSuccess: (_, hidden) => {
      queryClient.setQueryData(["hideHabitAddButton"], hidden);
    },
  });
  const trackerSettingQuery = useQuery({
    queryKey: ["hideTrackerAddButton"],
    queryFn: () => getHideTrackerAddButton(database),
  });
  const trackerSettingMutation = useMutation({
    mutationFn: (hidden: boolean) => setHideTrackerAddButton(database, hidden),
    onSuccess: (_, hidden) => {
      queryClient.setQueryData(["hideTrackerAddButton"], hidden);
    },
  });
  const disableEditsQuery = useQuery({
    queryKey: ["disableEdits"],
    queryFn: () => getDisableEdits(database),
  });
  const disableEditsMutation = useMutation({
    mutationFn: (disabled: boolean) => setDisableEdits(database, disabled),
    onSuccess: (_, disabled) => {
      queryClient.setQueryData(["disableEdits"], disabled);
    },
  });
  const habitHidden = habitSettingQuery.data ?? false;
  const trackerHidden = trackerSettingQuery.data ?? false;
  const editsDisabled = disableEditsQuery.data ?? false;

  return (
    <View className="flex-1 bg-white px-5 pt-4">
      <View className="flex-row items-center justify-between border-b border-neutral-100 py-3">
        <Text className="font-semibold text-black">Hide habit add button</Text>
        <Pressable
          accessibilityLabel="Hide habit add button"
          accessibilityRole="switch"
          accessibilityState={{ checked: habitHidden }}
          className={`h-7 w-12 justify-center rounded-full p-1 ${
            habitHidden ? "items-end bg-black" : "items-start bg-neutral-300"
          }`}
          disabled={
            habitSettingQuery.isLoading || habitSettingMutation.isPending
          }
          onPress={() => habitSettingMutation.mutate(!habitHidden)}
        >
          <View className="h-5 w-5 rounded-full bg-white" />
        </Pressable>
      </View>
      <View className="flex-row items-center justify-between border-b border-neutral-100 py-3">
        <Text className="font-semibold text-black">
          Hide tracker add button
        </Text>
        <Pressable
          accessibilityLabel="Hide tracker add button"
          accessibilityRole="switch"
          accessibilityState={{ checked: trackerHidden }}
          className={`h-7 w-12 justify-center rounded-full p-1 ${
            trackerHidden ? "items-end bg-black" : "items-start bg-neutral-300"
          }`}
          disabled={
            trackerSettingQuery.isLoading || trackerSettingMutation.isPending
          }
          onPress={() => trackerSettingMutation.mutate(!trackerHidden)}
        >
          <View className="h-5 w-5 rounded-full bg-white" />
        </Pressable>
      </View>
      <View className="flex-row items-center justify-between border-b border-neutral-100 py-3">
        <Text className="font-semibold text-black">Disable edits</Text>
        <Pressable
          accessibilityLabel="Disable edits"
          accessibilityRole="switch"
          accessibilityState={{ checked: editsDisabled }}
          className={`h-7 w-12 justify-center rounded-full p-1 ${
            editsDisabled ? "items-end bg-black" : "items-start bg-neutral-300"
          }`}
          disabled={
            disableEditsQuery.isLoading || disableEditsMutation.isPending
          }
          onPress={() => disableEditsMutation.mutate(!editsDisabled)}
        >
          <View className="h-5 w-5 rounded-full bg-white" />
        </Pressable>
      </View>
    </View>
  );
}
