import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="habit"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#111827",
        tabBarInactiveTintColor: "#a3a3a3",
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#f3f4f6",
        },
      }}
    >
      <Tabs.Screen
        name="habit"
        options={{
          title: "Habits",
        }}
      />
      <Tabs.Screen
        name="task"
        options={{
          title: "Tasks",
        }}
      />
      <Tabs.Screen
        name="tracker"
        options={{
          title: "Trackers",
        }}
      />
      <Tabs.Screen
        name="daily-review"
        options={{
          title: "Review",
        }}
      />
    </Tabs>
  );
}
