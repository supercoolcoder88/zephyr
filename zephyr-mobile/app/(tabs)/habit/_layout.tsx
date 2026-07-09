import { router, Stack } from "expo-router";
import { Pressable, Text, View } from "react-native";

const headerOptions = {
  headerStyle: {
    backgroundColor: "#f9fafb",
  },
  headerShadowVisible: false,
  headerTintColor: "#172554",
  headerTitleStyle: {
    color: "#030712",
    fontSize: 30,
    fontWeight: "700" as const,
  },
};

export default function HabitLayout() {
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen
        name="index"
        options={{
          title: "Habits",
          headerRight: () => (
            <View className="flex-row gap-3">
              <Pressable
                className="rounded bg-blue-950 px-4 py-2"
                onPress={() => router.push("/habit/create")}
              >
                <Text className="text-sm font-semibold text-white">add</Text>
              </Pressable>
              <Pressable
                className="rounded border border-gray-200 bg-white px-4 py-2"
                onPress={() => router.push("/habit/list")}
              >
                <Text className="text-sm font-semibold text-blue-950">
                  list
                </Text>
              </Pressable>
            </View>
          ),
        }}
      />
      <Stack.Screen name="create" options={{ title: "New habit" }} />
      <Stack.Screen name="list" options={{ title: "Habits List" }} />
    </Stack>
  );
}
