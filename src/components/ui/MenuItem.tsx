import type { ComponentProps } from 'react';

interface Props extends ComponentProps<'button'> {
  checked: boolean;
}

export default function MenuItem({
  checked,
  className = '',
  children,
  ...props
}: Props) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      onPointerMove={(e) => e.currentTarget.focus()}
      className={`group flex w-full items-center gap-2 px-3 py-1 text-left text-sm whitespace-nowrap text-ink transition-colors duration-150 ease-mech not-aria-checked:text-mute focus:bg-paper focus:text-void ${className}`}
      {...props}
    >
      <span aria-hidden className="w-2">
        {checked && '>'}
      </span>
      {children}
    </button>
  );
}
