import { Pressable } from "react-native";

import ExpoIcon, { selectIcon } from "./ExpoIcon";

const addIcon = selectIcon({
  android: "add",
  ios: "plus",
});

type FloatingAddButtonProps = {
  accessibilityLabel: string;
  onPress: () => void;
};

export default function FloatingAddButton({
  accessibilityLabel,
  onPress,
}: FloatingAddButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      className="absolute bottom-6 right-5 h-14 w-14 items-center justify-center rounded bg-black"
      onPress={onPress}
    >
      <ExpoIcon color="#ffffff" name={addIcon} size={26} />
    </Pressable>
  );
}
