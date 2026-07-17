import { Tabs } from "expo-router";

import ExpoIcon, { selectIcon } from "../../components/ExpoIcon";

const habitIcon = selectIcon({
  android: "repeat",
  ios: "repeat",
});
const taskIcon = selectIcon({
  android: "task_alt",
  ios: "checkmark.square",
});
const focusIcon = selectIcon({
  android: "timer",
  ios: "timer",
});
const settingsIcon = selectIcon({
  android: "settings",
  ios: "gearshape",
});

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="habit"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#000000",
        tabBarInactiveTintColor: "#a3a3a3",
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#e5e5e5",
        },
      }}
    >
      <Tabs.Screen
        name="habit"
        options={{
          tabBarIcon: ({ color, size }) => (
            <ExpoIcon color={color} name={habitIcon} size={size} />
          ),
          title: "Habits",
        }}
      />
      <Tabs.Screen
        name="task"
        options={{
          tabBarIcon: ({ color, size }) => (
            <ExpoIcon color={color} name={taskIcon} size={size} />
          ),
          title: "Tasks",
        }}
      />
      <Tabs.Screen
        name="focus"
        options={{
          tabBarIcon: ({ color, size }) => (
            <ExpoIcon color={color} name={focusIcon} size={size} />
          ),
          tabBarStyle: { display: "none" },
          title: "Focus",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ color, size }) => (
            <ExpoIcon color={color} name={settingsIcon} size={size} />
          ),
          title: "Settings",
        }}
      />
    </Tabs>
  );
}
