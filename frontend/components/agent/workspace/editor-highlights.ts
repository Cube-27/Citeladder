import { MapMode, StateEffect, StateField, type ChangeDesc, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';

import type { SuggestionHighlight } from '@/lib/agent/page-workspace';

export type HighlightAct = 'apply' | 'dismiss';
export type HighlightSet = Readonly<{
  items: readonly SuggestionHighlight[];
  actionable: boolean;
}>;

export const setHighlights = StateEffect.define<HighlightSet>();

const NONE: HighlightSet = { items: [], actionable: false };

function mapHighlights(
  highlights: readonly SuggestionHighlight[],
  changes: ChangeDesc,
): readonly SuggestionHighlight[] {
  return highlights.flatMap((highlight) => {
    const from = changes.mapPos(highlight.from, 1, MapMode.TrackDel);
    const to = changes.mapPos(highlight.to, -1, MapMode.TrackDel);
    if (from === null || to === null || to <= from) return [];
    return [{ ...highlight, from, to }];
  });
}

const ACTS: readonly { act: HighlightAct; text: string; label: string }[] = [
  { act: 'apply', text: 'Accept', label: 'Accept suggestion' },
  { act: 'dismiss', text: 'Dismiss', label: 'Dismiss suggestion' },
];

class ProposalWidget extends WidgetType {
  readonly id: string;
  readonly proposal: string;
  readonly actionable: boolean;

  constructor(highlight: SuggestionHighlight, proposal: string, actionable: boolean) {
    super();
    this.id = highlight.id;
    this.proposal = proposal;
    this.actionable = actionable;
  }

  eq(other: ProposalWidget) {
    return (
      other.id === this.id &&
      other.proposal === this.proposal &&
      other.actionable === this.actionable
    );
  }

  toDOM() {
    const root = document.createElement('span');
    root.className = 'page-editor-proposal';
    root.dataset.suggestionId = this.id;
    if (this.proposal) {
      const inserted = document.createElement('ins');
      inserted.className = 'page-editor-proposal-text';
      inserted.textContent = this.proposal;
      root.append(inserted);
    }
    if (!this.actionable) return root;
    for (const { act, text, label } of ACTS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `page-editor-proposal-act page-editor-proposal-${act}`;
      button.dataset.suggestionAct = act;
      button.setAttribute('aria-label', label);
      button.textContent = text;
      root.append(button);
    }
    return root;
  }

  ignoreEvent() {
    return false;
  }
}

function highlightClass(highlight: SuggestionHighlight): string {
  const replaced = highlight.proposal === null ? '' : ' page-editor-suggestion-replaced';
  return `page-editor-suggestion page-editor-suggestion-${highlight.tone}${replaced}`;
}

function decorations({ items, actionable }: HighlightSet): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const highlight of items) {
    ranges.push(
      Decoration.mark({
        tagName: 'mark',
        class: highlightClass(highlight),
        attributes: { 'data-suggestion-id': highlight.id, title: highlight.label },
      }).range(highlight.from, highlight.to),
    );
    if (highlight.proposal !== null)
      ranges.push(
        Decoration.widget({
          widget: new ProposalWidget(highlight, highlight.proposal, actionable),
          side: 1,
        }).range(highlight.to),
      );
  }
  return Decoration.set(ranges, true);
}

export const highlightField = StateField.define<HighlightSet>({
  create: () => NONE,
  update(highlights, transaction) {
    for (const effect of transaction.effects) if (effect.is(setHighlights)) return effect.value;
    if (!transaction.docChanged) return highlights;
    return { ...highlights, items: mapHighlights(highlights.items, transaction.changes) };
  },
  provide: (field) => EditorView.decorations.from(field, decorations),
});

export function highlightAt(
  highlights: readonly SuggestionHighlight[],
  position: number,
): SuggestionHighlight | null {
  let found: SuggestionHighlight | null = null;
  for (const highlight of highlights) {
    if (position < highlight.from || position > highlight.to) continue;
    if (!found || highlight.to - highlight.from < found.to - found.from) found = highlight;
  }
  return found;
}
