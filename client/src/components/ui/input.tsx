import * as React from 'react';
import { cn } from '@/lib/cn';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'h-10 w-full rounded-md border border-ink-200 bg-ink-0 px-3 text-sm text-ink-800 placeholder:text-ink-400 transition-colors duration-fast',
        'focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20',
        'disabled:opacity-50 disabled:bg-ink-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
