import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ExpoIcon, { selectIcon } from "../../../components/ExpoIcon";
import {
  FOCUS_DURATION_SECONDS,
  FOCUS_STEP_SECONDS,
  formatTimer,
} from "../../../utils/focusTimer";

const pauseIcon = selectIcon({ android: "pause", ios: "pause.fill" });
const playIcon = selectIcon({ android: "play_arrow", ios: "play.fill" });
const dimIcon = selectIcon({ android: "light_mode", ios: "sun.max.fill" });
const exitIcon = selectIcon({ android: "close", ios: "xmark" });
const minusIcon = selectIcon({ android: "remove", ios: "minus" });
const plusIcon = selectIcon({ android: "add", ios: "plus" });
const KEEP_AWAKE_TAG = "focus-timer";

type IconButtonProps = {
  accessibilityLabel: string;
  icon: ReturnType<typeof selectIcon>;
  onPress: () => void;
  selected?: boolean;
};

function IconButton({
  accessibilityLabel,
  icon,
  onPress,
  selected = false,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`h-14 w-14 items-center justify-center rounded-full ${
        selected ? "bg-white" : "border border-neutral-700"
      }`}
      onPress={onPress}
    >
      <ExpoIcon
        color={selected ? "#000000" : "#ffffff"}
        name={icon}
        size={25}
      />
    </Pressable>
  );
}

export default function FocusScreen() {
  const router = useRouter();
  const completionSound = useAudioPlayer(
    require("../../../assets/sounds/focus-complete.wav"),
  );
  const [durationSeconds, setDurationSeconds] = useState(
    FOCUS_DURATION_SECONDS,
  );
  const [secondsRemaining, setSecondsRemaining] = useState(
    FOCUS_DURATION_SECONDS,
  );
  const [hasStarted, setHasStarted] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isDimmed, setIsDimmed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setDurationSeconds(FOCUS_DURATION_SECONDS);
      setSecondsRemaining(FOCUS_DURATION_SECONDS);
      setHasStarted(false);
      setIsRunning(false);
      setIsDimmed(false);
      void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
      void setAudioModeAsync({
        interruptionMode: "mixWithOthers",
        playsInSilentMode: true,
      });

      return () => {
        void deactivateKeepAwake(KEEP_AWAKE_TAG);
      };
    }, []),
  );

  useEffect(() => {
    if (!isRunning || secondsRemaining === 0) {
      return;
    }

    const interval = setInterval(() => {
      setSecondsRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, secondsRemaining]);

  useEffect(() => {
    if (secondsRemaining === 0 && hasStarted) {
      setIsRunning(false);
      completionSound.seekTo(0);
      completionSound.play();
    }
  }, [completionSound, hasStarted, secondsRemaining]);

  function adjustDuration(change: number) {
    if (hasStarted) {
      return;
    }

    const nextDuration = Math.max(FOCUS_STEP_SECONDS, durationSeconds + change);
    setDurationSeconds(nextDuration);
    setSecondsRemaining(nextDuration);
  }

  function toggleTimer() {
    if (secondsRemaining === 0) {
      setSecondsRemaining(durationSeconds);
    }

    setHasStarted(true);
    setIsRunning((current) => !current || secondsRemaining === 0);
  }

  function exitFocus() {
    router.navigate("/habit");
  }

  return (
    <SafeAreaView className="flex-1 bg-black" edges={["left", "right"]}>
      <View className="flex-1 items-center justify-center px-8">
        <Text
          accessibilityLabel={`${formatTimer(secondsRemaining)} remaining`}
          className="text-8xl font-bold tabular-nums text-white"
        >
          {formatTimer(secondsRemaining)}
        </Text>

        {!isRunning && hasStarted && secondsRemaining > 0 ? (
          <Text className="mt-2 text-base text-neutral-500">Paused</Text>
        ) : null}

        <View className="mt-7 flex-row gap-3">
          {!hasStarted ? (
            <IconButton
              accessibilityLabel="Subtract 5 minutes"
              icon={minusIcon}
              onPress={() => adjustDuration(-FOCUS_STEP_SECONDS)}
            />
          ) : null}
          <IconButton
            accessibilityLabel={isRunning ? "Pause timer" : "Start timer"}
            icon={isRunning ? pauseIcon : playIcon}
            onPress={toggleTimer}
            selected
          />
          {!hasStarted ? (
            <IconButton
              accessibilityLabel="Add 5 minutes"
              icon={plusIcon}
              onPress={() => adjustDuration(FOCUS_STEP_SECONDS)}
            />
          ) : null}
          <IconButton
            accessibilityLabel={isDimmed ? "Brighten screen" : "Dim screen"}
            icon={dimIcon}
            onPress={() => setIsDimmed((current) => !current)}
            selected={isDimmed}
          />
          <IconButton
            accessibilityLabel="Exit focus"
            icon={exitIcon}
            onPress={exitFocus}
          />
        </View>
      </View>

      {isDimmed ? (
        <View
          className="absolute inset-0 bg-black opacity-75"
          pointerEvents="none"
        />
      ) : null}
    </SafeAreaView>
  );
}
