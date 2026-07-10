import { SymbolView, type SymbolViewProps } from "expo-symbols";

type ExpoIconProps = Pick<
  SymbolViewProps,
  "accessibilityLabel" | "name" | "size"
> & {
  color?: SymbolViewProps["tintColor"];
};

export function selectIcon(name: Exclude<SymbolViewProps["name"], string>) {
  return name;
}

export default function ExpoIcon({ color, ...props }: ExpoIconProps) {
  return <SymbolView {...props} pointerEvents="none" tintColor={color} />;
}
