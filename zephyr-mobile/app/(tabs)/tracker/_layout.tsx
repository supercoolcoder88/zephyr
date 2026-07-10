import { Stack } from "expo-router";

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

export default function TrackerLayout() {
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="index" options={{ title: "Trackers" }} />
    </Stack>
  );
}
