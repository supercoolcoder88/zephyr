import type { ReactNode, RefObject } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

type FocusableInput = {
  focus: () => void;
};

type ItemDrawerProps = {
  children: ReactNode;
  deleteLabel?: string;
  deletePending?: boolean;
  error?: string | null;
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
    if (!initialFocusRef) {
      return;
    }

    const focus = () => initialFocusRef.current?.focus();

    requestAnimationFrame(() => {
      focus();
      setTimeout(focus, 100);
      setTimeout(focus, 250);
    });
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      onShow={focusInitialInput}
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end bg-black/30"
      >
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="rounded-t-lg bg-white pt-4">
          <ScrollView
            className="max-h-[90%]"
            contentContainerClassName="px-5 pb-6"
            keyboardShouldPersistTaps="handled"
          >
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-xl font-bold text-gray-950">{title}</Text>
              <Pressable className="px-2 py-1" onPress={onClose}>
                <Text className="text-base font-semibold text-gray-500">
                  Close
                </Text>
              </Pressable>
            </View>

            <View className="gap-3">{children}</View>

            {error ? (
              <Text className="mt-3 text-sm text-gray-500">{error}</Text>
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
                className="flex-1 rounded bg-blue-950 px-4 py-3"
                disabled={submitPending}
                onPress={onSubmit}
              >
                <Text className="text-center font-semibold text-white">
                  {submitPending ? "Saving..." : submitLabel}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
