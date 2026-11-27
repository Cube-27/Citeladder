import * as MenuPrimitive from '@radix-ui/react-dropdown-menu';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useState,
  type ComponentPropsWithoutRef,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

import { Check, ChevronRight } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { POP_FACE } from '@/components/ui/slip';
import { Icon } from '@/components/ui/icon';

export const MENU_PANEL = cn(
  POP_FACE,
  'menu-panel z-modal focus-ring overflow-hidden p-popup-inset',
);

export function menuItemClasses({
  danger = false,
  className,
}: Readonly<{ danger?: boolean; className?: string }> = {}) {
  return cn(
    'press press-soft focus-ring text-body text-ink relative flex min-h-control-md w-full shrink-0 cursor-pointer items-center gap-2 rounded-popup-item px-2 app:px-2.5 py-1 text-left select-none',
    'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-disabled',
    danger
      ? 'text-negative data-[highlighted]:bg-negative-wash hover:bg-negative-wash data-[disabled]:hover:bg-transparent app:data-[highlighted]:bg-transparent app:hover:bg-transparent app:data-[highlighted]:overlay-hover app:hover:overlay-hover [&_svg]:text-negative'
      : 'text-ink aria-selected:overlay-selected not-aria-selected:data-[highlighted]:overlay-hover not-aria-selected:not-data-[disabled]:hover:overlay-hover',
    className,
  );
}

export function Menu({ children, ...props }: Readonly<MenuPrimitive.DropdownMenuProps>) {
  const nested = useContext(MenuNested);
  const fold = useContext(MenuFold);
  const id = useId();
  useEffect(() => {
    if (!fold) return;
    fold.set(id, children);
    return () => {
      fold.delete(id);
    };
  }, [fold, id, children]);
  if (nested) return children;
  const root = <MenuPrimitive.Root {...props}>{children}</MenuPrimitive.Root>;
  return fold ? (
    <span data-menu-fold={id} className="contents">
      {root}
    </span>
  ) : (
    root
  );
}

export const MenuFold = createContext<Map<string, ReactNode> | null>(null);
export const MenuNested = createContext(false);

export function MenuTrigger(props: Readonly<MenuPrimitive.DropdownMenuTriggerProps>) {
  return useContext(MenuNested) ? null : <MenuPrimitive.Trigger {...props} />;
}
export function MenuIconTrigger(
  props: Readonly<Omit<MenuPrimitive.DropdownMenuTriggerProps, 'className' | 'asChild'>>,
) {
  if (useContext(MenuNested)) return null;
  return (
    <MenuPrimitive.Trigger
      {...props}
      className="focus-ring not-data-[state=open]:hover:overlay-hover data-[state=open]:overlay-pressed rounded-control size-control-md flex shrink-0 items-center justify-center transition-colors"
    />
  );
}

export function MenuAlert({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p role="alert" className="text-caption text-negative px-2 py-2">
      {children}
    </p>
  );
}

export const MenuRadioGroup = MenuPrimitive.RadioGroup;
export const MenuSub = MenuPrimitive.Sub;

export function MenuSubTrigger({
  value,
  icon,
  className,
  children,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<typeof MenuPrimitive.SubTrigger>, 'children'> & {
    children: string;
    value?: string;
    icon?: ReactNode;
  }
>) {
  return (
    <MenuPrimitive.SubTrigger
      className={menuItemClasses({ className: cn('data-[state=open]:overlay-hover', className) })}
      aria-label={value ? `${children}: ${value}` : undefined}
      {...props}
    >
      <Lead>{icon}</Lead>
      <span className="shrink-0">{children}</span>
      {value ? (
        <span className="text-ink-2 ms-auto min-w-0 truncate ps-4 text-end">{value}</span>
      ) : null}
      <ChevronRight
        className={cn('text-ink-2 size-3.5 shrink-0', !value && 'ms-auto')}
        aria-hidden
      />
    </MenuPrimitive.SubTrigger>
  );
}

export function MenuSubContent({
  sideOffset = 4,
  collisionPadding = 8,
  children,
  ...props
}: Readonly<Omit<ComponentPropsWithoutRef<typeof MenuPrimitive.SubContent>, 'className'>>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.SubContent
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          MENU_PANEL,
          'flex max-h-menu-max max-w-menu-wide min-w-56 flex-col overflow-auto',
        )}
        {...props}
      >
        <GutterScope>{children}</GutterScope>
      </MenuPrimitive.SubContent>
    </MenuPrimitive.Portal>
  );
}

export function MenuContent({
  align = 'start',
  side = 'bottom',
  sideOffset = 4,
  collisionPadding = 8,
  children,
  ...props
}: Readonly<Omit<ComponentPropsWithoutRef<typeof MenuPrimitive.Content>, 'className'>>) {
  if (useContext(MenuNested)) return <MenuSubContent>{children}</MenuSubContent>;
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        align={align}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          MENU_PANEL,
          'flex max-h-menu-max max-w-80 min-w-menu-trigger flex-col overflow-auto',
        )}
        {...props}
      >
        <GutterScope>{children}</GutterScope>
      </MenuPrimitive.Content>
    </MenuPrimitive.Portal>
  );
}

const CheckGutter = createContext(false);
const ReserveGutter = createContext<Dispatch<SetStateAction<number>> | null>(null);

function GutterScope({ children }: Readonly<{ children: ReactNode }>) {
  const [rows, setRows] = useState(0);
  return (
    <ReserveGutter value={setRows}>
      <CheckGutter value={rows > 0}>{children}</CheckGutter>
    </ReserveGutter>
  );
}

function Lead({ children }: Readonly<{ children?: ReactNode }>) {
  const gutter = useContext(CheckGutter);
  if (!children && !gutter) return null;
  return (
    <span
      data-menu-lead=""
      className="text-ink-2 flex size-4 shrink-0 items-center justify-center [&_svg]:size-3.5"
    >
      {children}
    </span>
  );
}

export function MenuItem({
  icon,
  shortcut,
  value,
  selected = false,
  danger = false,
  quietWhenDisabled = false,
  className,
  children,
  ...props
}: Readonly<
  ComponentPropsWithoutRef<typeof MenuPrimitive.Item> & {
    icon?: ReactNode;
    shortcut?: string;
    value?: string;
    selected?: boolean;
    danger?: boolean;
    quietWhenDisabled?: boolean;
  }
>) {
  return (
    <MenuPrimitive.Item
      className={menuItemClasses({
        danger,
        className: cn(quietWhenDisabled && 'data-[disabled]:text-ink-2', className),
      })}
      {...props}
    >
      <Lead>{icon}</Lead>
      <span className={cn('min-w-0 truncate', value ? 'shrink-0' : 'flex-1')}>{children}</span>
      {value ? (
        <span className="text-ink-2 ms-auto min-w-0 truncate ps-4 text-end">{value}</span>
      ) : null}
      {shortcut ? <span className="text-code text-ink-2 ms-4 font-mono">{shortcut}</span> : null}
      {selected ? <Icon icon={Check} size="flush" tone="accent" /> : null}
    </MenuPrimitive.Item>
  );
}

export function MenuLinkItem({
  className,
  children,
  ...props
}: Readonly<Omit<ComponentPropsWithoutRef<typeof MenuPrimitive.Item>, 'asChild'>>) {
  return (
    <MenuPrimitive.Item asChild className={menuItemClasses({ className })} {...props}>
      {children}
    </MenuPrimitive.Item>
  );
}

function Indicator() {
  const reserve = useContext(ReserveGutter);
  useLayoutEffect(() => {
    if (!reserve) return undefined;
    reserve((rows) => rows + 1);
    return () => reserve((rows) => rows - 1);
  }, [reserve]);
  return (
    <span data-menu-lead="" className="text-ink flex size-4 shrink-0 items-center justify-center">
      <MenuPrimitive.ItemIndicator>
        <Icon icon={Check} size="flush" />
      </MenuPrimitive.ItemIndicator>
    </span>
  );
}

export function MenuCheckboxItem({
  className,
  children,
  ...props
}: Readonly<ComponentPropsWithoutRef<typeof MenuPrimitive.CheckboxItem>>) {
  return (
    <MenuPrimitive.CheckboxItem className={menuItemClasses({ className })} {...props}>
      <Indicator />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </MenuPrimitive.CheckboxItem>
  );
}

export function MenuRadioItem({
  className,
  children,
  ...props
}: Readonly<ComponentPropsWithoutRef<typeof MenuPrimitive.RadioItem>>) {
  return (
    <MenuPrimitive.RadioItem className={menuItemClasses({ className })} {...props}>
      <Indicator />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </MenuPrimitive.RadioItem>
  );
}

export function MenuSeparator(
  props: Readonly<Omit<ComponentPropsWithoutRef<typeof MenuPrimitive.Separator>, 'className'>>,
) {
  return (
    <MenuPrimitive.Separator
      {...props}
      className="bg-rule app:mx-menu-rule-inset -mx-1 my-1 h-px shrink-0"
    />
  );
}

export function MenuControlRow({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="text-body text-ink min-h-control-md flex items-center justify-between gap-4 px-2 py-1">
      <span>{label}</span>
      {children}
    </div>
  );
}

export function MenuLabel({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <MenuPrimitive.Label className="text-ink-2 text-caption px-2 pt-2 pb-1">
      {children}
    </MenuPrimitive.Label>
  );
}
