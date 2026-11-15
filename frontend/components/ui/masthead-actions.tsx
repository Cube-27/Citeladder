import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

import { IconButton } from '@/components/ui/button';
import {
  Menu,
  MenuContent,
  MenuFold,
  MenuItem,
  MenuNested,
  MenuSub,
  MenuSubTrigger,
  MenuTrigger,
} from '@/components/ui/menu';
import { cn } from '@/lib/utils';

/**
 * Where a masthead draws its one primary action: `undefined` outside a
 * masthead, `null` until the slot has mounted.
 */
export const MastheadPrimarySlot = createContext<HTMLElement | null | undefined>(undefined);

/**
 * The page's one primary action, wherever the actions component renders it:
 * drawn in the masthead's primary slot after the secondary actions, so it
 * stays in view when they fold behind More. Outside a masthead it
 * renders in place.
 */
export function MastheadPrimary({ children }: Readonly<{ children: ReactNode }>) {
  const slot = useContext(MastheadPrimarySlot);
  if (slot === undefined) return children;
  return slot ? createPortal(children, slot) : null;
}

/** One row of More: a folded control it presses, or a folded menu it opens as a submenu. */
type FoldedEntry = Readonly<{
  key: string;
  label: string;
  icon: Element | null;
  disabled: boolean;
  reason: string | null;
  run:
    | Readonly<{ kind: 'press'; control: HTMLElement }>
    | Readonly<{ kind: 'menu'; items: ReactNode }>;
}>;

/**
 * The masthead's controls other than the primary (search, secondary actions,
 * "Ask agent"). In a wide masthead they sit in the row. Below `rail`, two or
 * more, or one beside the primary, fold behind one "More" menu; a row too
 * full for its controls folds them at any width, then the primary too, as
 * More's first item, so no label is ever cut. The controls stay mounted
 * (hidden) so their dialogs and state survive; each More item presses its
 * control, and a folded menu (Manage project) becomes a submenu.
 */
export function MastheadOverflow({ children }: Readonly<{ children: ReactNode }>) {
  const [group, setGroup] = useState<HTMLDivElement | null>(null);
  const [foldedSlot, setFoldedSlot] = useState<HTMLSpanElement | null>(null);
  const [menus] = useState(() => new Map<string, ReactNode>());
  const [entries, setEntries] = useState<readonly FoldedEntry[]>([]);
  const rowSlot = useContext(MastheadPrimarySlot) ?? null;
  const secondary = useChildCount(group);
  const primary = useChildCount(rowSlot) + useChildCount(foldedSlot);
  const stage = useFoldStage(
    group?.closest<HTMLElement>('[data-masthead]') ?? null,
    (secondary > 0 ? 1 : 0) + (primary > 0 ? 1 : 0),
    secondary * 10 + primary,
  );
  // One secondary action alone stays in the row; beside another action or the primary, it folds.
  const belowRail = secondary > 1 || (secondary === 1 && primary > 0);
  const secondaryFolded = secondary > 0 && stage >= 1;
  const primaryFolded = primary > 0 && stage >= (secondary > 0 ? 2 : 1);
  const always = secondaryFolded || primaryFolded;

  return (
    <>
      {belowRail || always ? (
        <Menu
          modal={false}
          onOpenChange={(open) => {
            if (open) setEntries(foldedEntries([foldedSlot, group], menus));
          }}
        >
          <MenuTrigger asChild>
            <IconButton
              icon={MoreHorizontal}
              label="More"
              variant="secondary"
              className={always ? undefined : 'rail:hidden'}
            />
          </MenuTrigger>
          <MenuContent align="end">
            {entries.map((entry) => (
              <FoldedItem key={entry.key} entry={entry} />
            ))}
          </MenuContent>
        </Menu>
      ) : null}
      <span ref={setFoldedSlot} data-masthead-folded-primary="" hidden />
      <MastheadPrimarySlot.Provider value={primaryFolded ? foldedSlot : rowSlot}>
        <MenuFold.Provider value={menus}>
          <div
            ref={setGroup}
            data-masthead-overflow=""
            className={cn(
              secondaryFolded ? 'hidden' : belowRail ? 'not-rail:hidden rail:contents' : 'contents',
            )}
          >
            {children}
          </div>
        </MenuFold.Provider>
      </MastheadPrimarySlot.Provider>
    </>
  );
}

function FoldedItem({ entry }: Readonly<{ entry: FoldedEntry }>) {
  // An item without a glyph keeps the empty 16px lead, so every label aligns.
  const icon = entry.icon ? <FoldedIcon glyph={entry.icon} /> : <span />;
  if (entry.run.kind === 'menu') {
    return (
      <MenuSub>
        <MenuSubTrigger icon={icon} disabled={entry.disabled}>
          {entry.label}
        </MenuSubTrigger>
        <MenuNested.Provider value>{entry.run.items}</MenuNested.Provider>
      </MenuSub>
    );
  }
  const { control } = entry.run;
  return (
    <MenuItem
      icon={icon}
      disabled={entry.disabled}
      className="data-[disabled]:text-ink-2"
      onSelect={() => control.click()}
    >
      {entry.reason ? (
        <span className="grid min-w-0">
          <span>{entry.label}</span>
          <span className="type-caption">{entry.reason}</span>
        </span>
      ) : (
        entry.label
      )}
    </MenuItem>
  );
}

/** The folded control's own 16px glyph, copied into its row. */
function FoldedIcon({ glyph }: Readonly<{ glyph: Element }>) {
  return <span className="contents" ref={(node) => node?.replaceChildren(glyph.cloneNode(true))} />;
}

const CONTROL = 'button, a[href], [data-menu-fold]';

/** The folded controls in order (the folded primary first), read when More opens. */
function foldedEntries(
  boxes: readonly (HTMLElement | null)[],
  menus: ReadonlyMap<string, ReactNode>,
): FoldedEntry[] {
  return boxes.flatMap((box) =>
    box
      ? [...box.querySelectorAll<HTMLElement>(CONTROL)]
          .filter((node) => !node.parentElement?.closest(CONTROL))
          .flatMap((node, index) =>
            foldedEntry(node, menus, `${box.dataset.mastheadOverflow ?? 'p'}${index}`),
          )
      : [],
  );
}

function foldedEntry(
  node: HTMLElement,
  menus: ReadonlyMap<string, ReactNode>,
  key: string,
): FoldedEntry[] {
  const menuId = node.dataset.menuFold;
  const control = menuId ? node.querySelector<HTMLElement>('button, a[href]') : node;
  if (!control) return [];
  const label = (control.getAttribute('aria-label') ?? control.textContent ?? '').trim();
  if (!label) return [];
  const icon = leadGlyph(control);
  const disabled = control.matches(':disabled') || control.getAttribute('aria-disabled') === 'true';
  const described = control.getAttribute('aria-describedby');
  const reason =
    (described ? document.getElementById(described)?.textContent?.trim() : null) ??
    control.getAttribute('title');
  const items = menuId ? menus.get(menuId) : undefined;
  return [
    {
      key,
      label,
      icon,
      disabled,
      reason: disabled && reason ? reason : null,
      run: items === undefined ? { kind: 'press', control } : { kind: 'menu', items },
    },
  ];
}

/** The control's leading glyph: an icon before any text (never a trailing chevron). */
function leadGlyph(control: HTMLElement): SVGElement | null {
  const walker = document.createTreeWalker(control, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof SVGSVGElement) return node;
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) return null;
  }
  return null;
}

const UNFOLDED: readonly number[] = [];

/**
 * How much of the row has folded: 0 none, then the secondary controls, then
 * the primary. It folds one step while the row overflows and unfolds a step
 * only once the row is as wide as that step needed, so it never flips back
 * and forth; a different set of controls measures again.
 */
function useFoldStage(header: HTMLElement | null, steps: number, controls: number) {
  const [fold, setFold] = useState<Readonly<{ need: readonly number[]; controls: number }> | null>(
    null,
  );
  const need = fold?.controls === controls ? fold.need : UNFOLDED;
  const stage = need.length;
  useEffect(() => {
    if (!header) return;
    const measure = () => {
      const last = need.at(-1);
      if (last !== undefined && header.clientWidth >= last) {
        setFold({ need: need.slice(0, -1), controls });
        return;
      }
      const deficit = rowDeficit(header);
      if (deficit > 1 && stage < steps) {
        setFold({ need: [...need, header.clientWidth + deficit], controls });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, [header, steps, controls, stage, need]);
  return stage;
}

/** How many px the row lacks: the title squeezed under its minimum, plus controls past the edge. */
function rowDeficit(header: HTMLElement): number {
  const title = header.querySelector<HTMLElement>('[data-masthead-title]');
  const end = header.querySelector<HTMLElement>('[data-masthead-end]');
  const squeezed = title ? Math.max(0, title.scrollWidth - title.clientWidth) : 0;
  const edge =
    header.getBoundingClientRect().right - Number.parseFloat(getComputedStyle(header).paddingRight);
  const past = end ? Math.max(0, end.getBoundingClientRect().right - edge) : 0;
  return squeezed + past;
}

/**
 * How many controls the box holds, kept current as its children render; a
 * wrapper whose control drew nothing (no "Ask agent" on an Agent page) is none.
 */
function useChildCount(node: HTMLElement | null) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!node) return;
    const update = () =>
      setCount(
        [...node.children].filter((child) => child.matches('button, a') || child.firstElementChild)
          .length,
      );
    update();
    const observer = new MutationObserver(update);
    observer.observe(node, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [node]);
  return count;
}
