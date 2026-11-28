import { useState, type ReactNode } from 'react';

import { isTextCut, Tooltip } from '@/components/ui/tooltip';

function sidebarTexts(trigger: HTMLElement) {
  return [...trigger.querySelectorAll<HTMLElement>('[data-sidebar-text]')];
}

function isRail(trigger: HTMLElement) {
  if (trigger.closest('[data-nav-drawer]')) return false;
  return Boolean(trigger.closest('[data-sidebar-state="collapsed"]'));
}

export function SidebarRowTooltip({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  const shouldOpen = (trigger: HTMLElement) => {
    if (isRail(trigger)) return true;
    return sidebarTexts(trigger).some(isTextCut);
  };
  return (
    <Tooltip content={label} side="right" describe={false} shouldOpen={shouldOpen}>
      {children}
    </Tooltip>
  );
}

type SidebarTextLine = { line: string; text: string };

export function SidebarTextTooltip({
  inRail = false,
  children,
}: Readonly<{ inRail?: boolean | 'only'; children: ReactNode }>) {
  const [lines, setLines] = useState<readonly SidebarTextLine[]>([]);
  const openWhenCut = (trigger: HTMLElement) => {
    const parts = sidebarTexts(trigger);
    const rail = inRail !== false && isRail(trigger);
    if (!rail && (inRail === 'only' || !parts.some(isTextCut))) return false;
    const next = parts
      .map((part) => ({
        line: part.dataset.sidebarText ?? '',
        text: part.textContent?.trim() ?? '',
      }))
      .filter(({ text }) => text !== '');
    if (next.length === 0) return false;
    setLines(next);
    return true;
  };
  return (
    <Tooltip
      content={
        <span className="flex min-w-0 flex-col">
          {lines.map(({ line, text }) => (
            <span key={line} className="break-words">
              {text}
            </span>
          ))}
        </span>
      }
      side="right"
      describe={false}
      shouldOpen={openWhenCut}
    >
      {children}
    </Tooltip>
  );
}
