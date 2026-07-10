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

export default function DailyReviewLayout() {
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="index" options={{ title: "Review" }} />
      <Stack.Screen name="list" options={{ title: "List" }} />
    </Stack>
  );
}
