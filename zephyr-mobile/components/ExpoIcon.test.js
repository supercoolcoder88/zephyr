import { expect, mock, test } from "bun:test";

mock.module("expo-symbols", () => ({
  SymbolView: "SymbolView",
}));

test("lets the parent handle icon presses", async () => {
  const { default: ExpoIcon } = await import("./ExpoIcon");
  const element = ExpoIcon({
    color: "#000000",
    name: { android: "repeat", ios: "repeat" },
    size: 24,
  });

  expect(element.props.pointerEvents).toBe("none");
  expect(element.props).toMatchObject({ size: 24, tintColor: "#000000" });
});
