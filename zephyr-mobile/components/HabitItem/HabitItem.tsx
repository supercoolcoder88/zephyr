import { Pressable, Text, View } from "react-native";

export type HabitItemProps = {
  completed: boolean;
  onPress: () => void;
  onToggle: () => void;
  title: string;
  score: number;
};

export default function HabitItem({
  completed,
  onPress,
  onToggle,
  title,
  score,
}: HabitItemProps) {
  return (
    <Pressable
      className={`mb-4 flex-row items-center rounded border px-4 py-4 shadow-sm ${
        completed ? "border-gray-100 bg-gray-100" : "border-gray-200 bg-white"
      }`}
      onPress={onPress}
    >
      <View className="flex-1 flex-row items-center">
        <Text
          className={`text-base font-semibold ${
            completed ? "text-gray-400" : "text-gray-950"
          }`}
        >
          {title}
        </Text>
        <Text className="ml-2 text-xs font-semibold text-gray-400">
          {score}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={
          completed ? `Mark ${title} incomplete` : `Mark ${title} complete`
        }
        accessibilityRole="checkbox"
        accessibilityState={{ checked: completed }}
        className={`ml-4 h-7 w-7 items-center justify-center rounded border-2 ${
          completed ? "border-blue-950 bg-blue-950" : "border-gray-300"
        }`}
        onPress={onToggle}
      >
        {completed ? <View className="h-3 w-3 rounded bg-white" /> : null}
      </Pressable>
    </Pressable>
  );
}
