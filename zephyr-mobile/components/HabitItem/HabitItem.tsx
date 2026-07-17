import { Pressable, Text, View } from "react-native";

export type HabitItemProps = {
  completed: boolean;
  onPress?: () => void;
  onToggle: () => void;
  streak: number;
  title: string;
};

export default function HabitItem({
  completed,
  onPress,
  onToggle,
  streak,
  title,
}: HabitItemProps) {
  return (
    <Pressable
      className="flex-row items-center border-b border-neutral-100 bg-white py-3"
      onPress={onPress}
    >
      <View className="flex-1 flex-row items-center">
        <Text
          className={`text-base font-semibold ${
            completed ? "text-neutral-400" : "text-black"
          }`}
        >
          {title}
        </Text>
        {!completed && streak > 0 ? (
          <Text className="ml-2 text-sm font-semibold text-green-400">
            | {streak}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityLabel={
          completed ? `Mark ${title} incomplete` : `Mark ${title} complete`
        }
        accessibilityRole="checkbox"
        accessibilityState={{ checked: completed }}
        className={`ml-4 h-7 w-7 items-center justify-center rounded border-2 ${
          completed ? "border-black bg-black" : "border-neutral-300"
        }`}
        onPress={onToggle}
      >
        {completed ? <View className="h-3 w-3 rounded bg-white" /> : null}
      </Pressable>
    </Pressable>
  );
}
