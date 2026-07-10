import type { ReactNode, RefObject } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";

type FocusableInput = {
  blur: () => void;
  focus: () => void;
};

type ItemDrawerProps = {
  children: ReactNode;
  deleteLabel?: string;
  deletePending?: boolean;
  error?: string | null;
  focusOnOpen?: boolean;
  initialFocusRef?: RefObject<FocusableInput | null>;
  onClose: () => void;
  onDelete?: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitPending?: boolean;
  title: string;
  visible: boolean;
};

export default function ItemDrawer({
  children,
  deleteLabel = "Delete",
  deletePending = false,
  error,
  focusOnOpen = false,
  onClose,
  onDelete,
  onSubmit,
  submitLabel,
  submitPending = false,
  title,
  visible,
  initialFocusRef,
}: ItemDrawerProps) {
  function focusInitialInput() {
    if (!focusOnOpen || !initialFocusRef) {
      return;
    }

    initialFocusRef.current?.blur();
    const focus = () => initialFocusRef.current?.focus();

    requestAnimationFrame(() => {
      focus();
      setTimeout(focus, 100);
      setTimeout(focus, 250);
    });
  }

  function closeDrawer() {
    initialFocusRef?.current?.blur();
    Keyboard.dismiss();
    onClose();
  }

  function dismissDrawer() {
    initialFocusRef?.current?.blur();
    Keyboard.dismiss();
  }

  return (
    <Modal
      animationType="slide"
      onDismiss={dismissDrawer}
      onRequestClose={closeDrawer}
      onShow={focusInitialInput}
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end bg-black/30"
      >
        <Pressable className="absolute inset-0" onPress={closeDrawer} />
        <View className="bg-white px-5 pb-6 pt-4">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-xl font-bold text-black">{title}</Text>
            <Pressable className="px-2 py-1" onPress={closeDrawer}>
              <Text className="text-base font-semibold text-neutral-500">
                Close
              </Text>
            </Pressable>
          </View>

          <View className="gap-3">{children}</View>

          {error ? (
            <Text className="mt-3 text-sm text-neutral-500">{error}</Text>
          ) : null}

          <View className="mt-5 flex-row gap-2">
            {onDelete ? (
              <Pressable
                className="rounded border border-red-200 px-4 py-3"
                disabled={deletePending}
                onPress={onDelete}
              >
                <Text className="text-center font-semibold text-red-700">
                  {deletePending ? "Deleting..." : deleteLabel}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              className="flex-1 rounded bg-black px-4 py-3"
              disabled={submitPending}
              onPress={onSubmit}
            >
              <Text className="text-center font-semibold text-white">
                {submitPending ? "Saving..." : submitLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
