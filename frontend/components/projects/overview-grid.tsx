import { ArrowDown, ArrowUp, Maximize2, Minimize2, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { overviewWidgetTitles, type OverviewWidget } from '@citeladder/contracts/overview';
import { AppGrid } from '@/components/ui/app-grid';
import { IconButton } from '@/components/ui/button';
import { FloatingToolbar } from '@/components/ui/workspace';
import { moveWidget, overviewRows, removeWidget, toggleWidth } from '@/lib/overview/layout';

/**
 * The Overview's rows, as page sections: two half widgets share a row (a
 * halves grid, one height), a full or lone widget takes one. The page's
 * section rules separate them (owner, 2026-11-19: dividers, not boxes). While
 * editing, each widget carries its controls in an overlay, so entering or
 * leaving edit mode never moves a widget.
 */
export function OverviewGrid({
  widgets,
  editing,
  pending,
  onChange,
  render,
}: Readonly<{
  widgets: readonly OverviewWidget[];
  editing: boolean;
  pending: boolean;
  onChange: (widgets: OverviewWidget[]) => void;
  render: (widget: OverviewWidget) => ReactNode;
}>) {
  const cell = (widget: OverviewWidget) => {
    const index = widgets.indexOf(widget);
    return (
      // A section, so the page's section rules count it; the widget's own heading names its region.
      <section key={widget.key} data-widget={widget.key} className="relative min-w-0">
        {render(widget)}
        {editing ? (
          <WidgetControls
            widget={widget}
            first={index === 0}
            last={index === widgets.length - 1}
            only={widgets.length === 1}
            pending={pending}
            onMove={(to) => onChange(moveWidget(widgets, index, to))}
            onResize={() => onChange(toggleWidth(widgets, index))}
            onRemove={() => onChange(removeWidget(widgets, index))}
            index={index}
          />
        ) : null}
      </section>
    );
  };
  return overviewRows(widgets).map((row) =>
    row.length === 1 ? (
      cell(row[0])
    ) : (
      <AppGrid key={row.map((widget) => widget.key).join()} layout="halves">
        {row.map(cell)}
      </AppGrid>
    ),
  );
}

function WidgetControls({
  widget,
  index,
  first,
  last,
  only,
  pending,
  onMove,
  onResize,
  onRemove,
}: Readonly<{
  widget: OverviewWidget;
  index: number;
  first: boolean;
  last: boolean;
  only: boolean;
  pending: boolean;
  onMove: (to: number) => void;
  onResize: () => void;
  onRemove: () => void;
}>) {
  const title = overviewWidgetTitles[widget.key];
  const wide = widget.size === 'full';
  return (
    <FloatingToolbar>
      <IconButton
        icon={ArrowUp}
        label={`Move ${title} earlier`}
        disabled={pending || first}
        onClick={() => onMove(index - 1)}
      />
      <IconButton
        icon={ArrowDown}
        label={`Move ${title} later`}
        disabled={pending || last}
        onClick={() => onMove(index + 1)}
      />
      <IconButton
        icon={wide ? Minimize2 : Maximize2}
        label={wide ? `Make ${title} half width` : `Make ${title} full width`}
        disabled={pending}
        onClick={onResize}
      />
      <IconButton
        icon={X}
        label={`Remove ${title}`}
        disabled={pending || only}
        onClick={onRemove}
      />
    </FloatingToolbar>
  );
}
