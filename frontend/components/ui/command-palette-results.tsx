import type { LucideIcon } from 'lucide-react';
import type { RefObject } from 'react';

import { BrandMark } from '@/components/ui/brand-mark';
import { cn } from '@/lib/utils';

export type Command = {
  id: string;
  label: string;
  group: string;
  /** Nav destinations carry their canonical glyph; projects render a brand logo. */
  icon?: LucideIcon;
  logoUrl?: string | null;
  hint?: string;
  /** A destination's address, warmed when its row is highlighted. */
  href?: string;
  run: () => void;
};

/**
 * Results keep ONE flat order for the keyboard cursor, but render grouped.
 * Rebuilding sections from that flat list (rather than grouping first and
 * flattening for keys) is what keeps the highlighted row and the Enter target
 * the same element — the two orders can never drift apart.
 */
function toSections(results: readonly Command[]) {
  const sections: { group: string; rows: { command: Command; index: number }[] }[] = [];
  results.forEach((command, index) => {
    const last = sections.at(-1);
    if (last?.group === command.group) last.rows.push({ command, index });
    else sections.push({ group: command.group, rows: [{ command, index }] });
  });
  return sections;
}

/** The grouped result listbox, or the empty-state message beside it. */
export function CommandPaletteResults({
  results,
  query,
  activeIndex,
  listboxId,
  listRef,
  highlight,
  runCommand,
}: Readonly<{
  results: readonly Command[];
  query: string;
  activeIndex: number;
  listboxId: string;
  listRef: RefObject<HTMLDivElement | null>;
  highlight: (index: number) => void;
  runCommand: (command: Command | undefined) => void;
}>) {
  return (
    <div
      ref={listRef}
      className="content-scroll max-h-100 min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
    >
      {/* The empty state is a message, not an option, so it sits
            beside the listbox rather than inside it. */}
      {results.length === 0 ? (
        <p className="text-body-sm text-ink-secondary px-4 py-[var(--page-section-gap)] text-center">
          {`No matches for “${query}”`}
        </p>
      ) : null}
      <div
        id={listboxId}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Command results are an active-descendant popup; native select/datalist cannot contain grouped action buttons.
        role="listbox"
        aria-label="Commands"
      >
        {toSections(results).map((section, sectionIndex) => {
          const headingId = `${listboxId}-group-${sectionIndex}`;
          return (
            <div
              key={section.group}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A listbox may only own options and groups; fieldset is not a permitted child.
              role="group"
              aria-labelledby={headingId}
              className="[&+&]:mt-2"
            >
              <p id={headingId} className="text-ink-muted text-caption px-2 py-1">
                {section.group}
              </p>
              {section.rows.map(({ command, index }) => {
                const isActive = index === activeIndex;
                const Icon = command.icon;
                return (
                  <button
                    key={command.id}
                    id={`${listboxId}-${command.id}`}
                    type="button"
                    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Focus stays on the palette input while these action options are active descendants.
                    role="option"
                    // Options are reached through the input's active
                    // descendant, never by Tab.
                    tabIndex={-1}
                    aria-selected={isActive}
                    data-active={isActive}
                    onMouseMove={() => highlight(index)}
                    onClick={() => runCommand(command)}
                    className={cn(
                      'text-ink flex h-[var(--control-md)] w-full items-center gap-3 rounded-sm px-2 text-left text-body-sm',
                      isActive && 'overlay-hover',
                    )}
                  >
                    {Icon ? (
                      <Icon className="text-ink-secondary size-4 shrink-0" aria-hidden />
                    ) : (
                      <BrandMark
                        name={command.label}
                        logoUrl={command.logoUrl}
                        placement="inline"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">{command.label}</span>
                    {command.hint ? (
                      <span className="text-ink-muted text-caption shrink-0 whitespace-nowrap">
                        {command.hint}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
