/**
 * The Overview widget catalog and the edits a layout allows. Each edit returns
 * a new widget list; the caller saves it against the layout's version.
 */
import {
  overviewWidgetKeySchema,
  type OverviewWidget,
  type OverviewWidgetKey,
} from '@citeladder/contracts/overview';

/**
 * The Overview's rows: two consecutive half widgets share one, a full widget
 * takes one, and a half left alone (before a full widget, or last) spans its
 * row, so no row ends in an empty cell. The saved layout keeps their size.
 */
export function overviewRows(widgets: readonly OverviewWidget[]): OverviewRow[] {
  const rows: OverviewRow[] = [];
  for (const widget of widgets) {
    const last = rows.at(-1);
    // A row of one half widget is the only row still open.
    if (widget.size === 'half' && last?.length === 1 && last[0].size === 'half') {
      rows[rows.length - 1] = [last[0], widget];
    } else {
      rows.push([widget]);
    }
  }
  return rows;
}

/** One Overview row: a widget alone, or two half widgets side by side. */
export type OverviewRow = readonly [OverviewWidget] | readonly [OverviewWidget, OverviewWidget];

/** Widgets the layout does not show yet, in catalog order. */
export function addableWidgets(widgets: readonly OverviewWidget[]): OverviewWidgetKey[] {
  const shown = new Set(widgets.map((widget) => widget.key));
  return overviewWidgetKeySchema.options.filter((key) => !shown.has(key));
}

export function addWidget(widgets: readonly OverviewWidget[], key: OverviewWidgetKey) {
  return widgets.some((widget) => widget.key === key)
    ? [...widgets]
    : [...widgets, { key, size: 'half' as const }];
}

/** The last widget stays: an Overview with nothing on it is not a layout. */
export function removeWidget(widgets: readonly OverviewWidget[], index: number) {
  return widgets.length > 1 ? widgets.filter((_, position) => position !== index) : [...widgets];
}

export function moveWidget(widgets: readonly OverviewWidget[], from: number, to: number) {
  const moved = widgets[from];
  if (from === to || to < 0 || to >= widgets.length || !moved) return [...widgets];
  const next = [...widgets];
  next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function toggleWidth(widgets: readonly OverviewWidget[], index: number) {
  return widgets.map((widget, position) =>
    position === index
      ? { ...widget, size: widget.size === 'half' ? ('full' as const) : ('half' as const) }
      : widget,
  );
}
