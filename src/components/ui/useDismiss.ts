import { useEffect, useEffectEvent, type RefObject } from 'react';

export default function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  const dismiss = useEffectEvent((e: Event) => {
    if (
      e instanceof KeyboardEvent
        ? e.key === 'Escape'
        : !ref.current?.contains(e.target as Node)
    )
      onClose();
  });

  useEffect(() => {
    if (!open) return;
    const listener = (e: Event) => dismiss(e);
    document.addEventListener('pointerdown', listener);
    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('pointerdown', listener);
      document.removeEventListener('keydown', listener);
    };
  }, [open]);
}
