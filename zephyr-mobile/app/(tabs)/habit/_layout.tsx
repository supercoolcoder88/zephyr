import { Link, Stack } from "expo-router";
import { Pressable, Text } from "react-native";

const headerOptions = {
  headerStyle: {
    backgroundColor: "#ffffff",
  },
  headerShadowVisible: false,
  headerTintColor: "#000000",
  headerTitleStyle: {
    color: "#000000",
    fontSize: 28,
    fontWeight: "700" as const,
  },
  orientation: "portrait" as const,
};

export default function HabitLayout() {
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen
        name="index"
        options={{
          headerRight: () => (
            <Link href="/habit/review" asChild>
              <Pressable accessibilityRole="button" className="px-1 py-2">
                <Text className="font-semibold text-black">Review</Text>
              </Pressable>
            </Link>
          ),
          title: "Habits",
        }}
      />
      <Stack.Screen name="create" options={{ title: "New habit" }} />
      <Stack.Screen name="review" options={{ title: "Review" }} />
    </Stack>
  );
}
