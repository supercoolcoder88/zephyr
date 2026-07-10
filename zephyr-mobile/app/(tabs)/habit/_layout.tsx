import { Stack } from "expo-router";

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
};

export default function HabitLayout() {
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="index" options={{ title: "Habits" }} />
      <Stack.Screen name="create" options={{ title: "New habit" }} />
    </Stack>
  );
}
