import type { ComponentProps } from 'react';

const variants = {
  primary:
    'bg-paper text-void hover:bg-ink disabled:bg-line-strong disabled:text-mute',
  ghost: 'text-mute hover:text-ink aria-expanded:text-ink',
  destructive: 'text-mute hover:text-alert',
  'outline-destructive':
    'border border-alert text-alert hover:bg-alert hover:text-void',
};

const sizes = {
  inline: '',
  icon: 'size-6 justify-center',
  sm: 'h-6 px-3',
  md: 'h-8 px-4',
  lg: 'h-10 px-4',
};

interface Props extends ComponentProps<'button'> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

export default function Button({
  variant = 'ghost',
  size = 'inline',
  type = 'button',
  className = '',
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={`inline-flex items-center text-2xs tracking-widest uppercase transition-colors duration-150 ease-mech ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}
