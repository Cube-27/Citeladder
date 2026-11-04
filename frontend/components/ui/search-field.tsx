'use client';

import { useEffect, useRef, type InputHTMLAttributes } from 'react';
import { Search, X } from 'lucide-react';

import { Icon } from './icon';
import { Input } from './input';
import { Kbd } from './kbd';
import { Spinner } from './spinner';

export type SearchFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'size' | 'width'
> & {
  value: string;
  onValueChange: (value: string) => void;
  pending?: boolean;
  onClear?: () => void;
  /**
   * A cap shown while the field is empty; ⌘ or Ctrl plus its last key focuses
   * the field. `true` is "⌘K". Only the page's main search takes one.
   */
  shortcut?: true | string;
};

/**
 * SearchField — the search and filter box at the top of a list: the search
 * icon (a spinner while results load), the query, and one fixed-width end
 * slot holding the shortcut cap when empty or the clear button with a query,
 * so nothing moves when the query appears. The x button and Escape both clear
 * and keep focus. It filters as you type: no submit button.
 */
export function SearchField({
  value,
  onValueChange,
  pending = false,
  onClear,
  shortcut,
  className,
  onKeyDown,
  'aria-label': ariaLabel = 'Search',
  ...props
}: Readonly<SearchFieldProps>) {
  const ref = useRef<HTMLInputElement>(null);
  const cap = shortcut === true ? '⌘K' : shortcut;

  useEffect(() => {
    if (!cap) return undefined;
    const key = cap.slice(-1).toLowerCase();
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === key) {
        event.preventDefault();
        ref.current?.focus();
      }
    };
    document.addEventListener('keydown', onShortcut);
    return () => document.removeEventListener('keydown', onShortcut);
  }, [cap]);

  const clear = () => {
    if (onClear) onClear();
    else onValueChange('');
    ref.current?.focus();
  };

  return (
    <Input
      {...props}
      ref={ref}
      type="search"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && value) {
          event.preventDefault();
          clear();
        }
        onKeyDown?.(event);
      }}
      aria-label={ariaLabel}
      aria-busy={pending || undefined}
      containerClassName={className}
      className="[appearance:textfield] [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
      startContent={pending ? <Spinner /> : <Icon icon={Search} className="text-ink-muted" />}
      endContent={
        <span className="inline-flex h-5 min-w-7 items-center justify-end">
          {value ? (
            <button
              type="button"
              aria-label="Clear search"
              disabled={props.disabled}
              onClick={clear}
              className="focus-ring text-ink-muted enabled:hover:bg-surface-sunken enabled:hover:text-ink grid size-5 place-items-center rounded-xs transition-colors"
            >
              <Icon icon={X} />
            </button>
          ) : cap ? (
            <Kbd>{cap}</Kbd>
          ) : null}
        </span>
      }
    />
  );
}
