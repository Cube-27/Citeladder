import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { FileText, Search } from '@/lib/icons';
import { cn } from '@/lib/utils';
import {
  groupResults,
  highlight,
  searchArticles,
  searchIndexSchema,
  type SearchEntry,
} from '../lib/search';

export function DocsSearchDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [entries, setEntries] = useState<SearchEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const show = (from: HTMLElement | null) => {
    opener.current = from;
    setOpen(true);
    dialog.current?.showModal();
    input.current?.focus();
  };

  useEffect(() => {
    const shortcut = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key?.toLowerCase() !== 'k') return;
      event.preventDefault();
      if (dialog.current?.open) {
        dialog.current.close();
        return;
      }
      const triggers = document.querySelectorAll<HTMLElement>('[data-docs-search-trigger]');
      show([...triggers].find((trigger) => trigger.offsetParent !== null) ?? null);
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);

  useEffect(() => {
    const frame = dialog.current;
    if (!frame) return;
    const dismiss = (event: MouseEvent) => {
      if (event.target === frame) frame.close();
    };
    frame.addEventListener('click', dismiss);
    return () => frame.removeEventListener('click', dismiss);
  }, []);

  useEffect(() => {
    if (!open || entries) return;
    const controller = new AbortController();
    void fetch('/search-index.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Search unavailable');
        return response.json();
      })
      .then((json: unknown) => {
        const data = searchIndexSchema.parse(json);
        setEntries(data);
        setFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [open, entries, attempt]);

  const groups = groupResults(searchArticles(entries ?? [], query));
  const results = groups.flatMap((group) => group.items);
  const cursor = active < results.length ? active : 0;
  const optionId = (index: number) => `docs-search-option-${index}`;

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : results.length - 1;
      setActive((cursor + step) % results.length);
    } else if (event.key === 'Enter') {
      const target = results[cursor];
      if (!target) return;
      event.preventDefault();
      window.location.assign(target.href);
    }
  };

  return (
    <>
      <button
        type="button"
        data-docs-search-trigger="field"
        aria-label="Search docs"
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
        onClick={(event) => show(event.currentTarget)}
        className="focus-ring bg-panel text-ink-2 border-rule hover:border-rule-strong text-body h-control-md items-center gap-2 rounded-md border pr-2 pl-3 text-left transition-colors"
      >
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate" aria-hidden>
          Search docs
        </span>
        <Kbd keys={['Ctrl', 'K']} />
      </button>
      <IconButton
        icon={Search}
        label="Search docs"
        data-docs-search-trigger="icon"
        aria-haspopup="dialog"
        tooltip={false}
        onClick={(event) => show(event.currentTarget)}
      />
      <dialog
        ref={dialog}
        aria-labelledby="docs-search-title"
        aria-describedby="docs-search-description"
        onClose={() => {
          setOpen(false);
          if (opener.current?.isConnected) opener.current.focus();
        }}
        className="bg-panel text-ink shadow-pop backdrop:bg-scrim mx-auto mt-16 w-full max-w-160 flex-col overflow-hidden rounded-lg p-0 open:flex"
      >
        <h2 id="docs-search-title" className="sr-only">
          Search documentation
        </h2>
        <p id="docs-search-description" className="sr-only">
          Find guides across the product, Agent and MCP.
        </p>
        <div className="palette-field border-rule text-ink-2 h-control-lg flex shrink-0 items-center gap-3 border-b px-4">
          <Search className="size-4 shrink-0" aria-hidden />
          <label htmlFor="docs-query" className="sr-only">
            Search terms
          </label>
          <input
            id="docs-query"
            ref={input}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Try revisions or citations"
            autoComplete="off"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="docs-search-results"
            aria-autocomplete="list"
            aria-activedescendant={results.length ? optionId(cursor) : undefined}
            className="text-site-body text-ink placeholder:text-ink-2 h-full min-w-0 flex-1 bg-transparent"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div className="h-100 min-h-0 shrink overflow-y-auto overscroll-contain p-2">
          <div className="min-h-control-md flex items-center justify-between gap-3 px-2">
            <output className="text-caption text-ink-2">
              {searchStatus(failed, entries, query, results.length)}
            </output>
            {failed && (
              <Button
                variant="quiet"
                onClick={() => {
                  setFailed(false);
                  setAttempt((value) => value + 1);
                }}
              >
                Retry search
              </Button>
            )}
          </div>
          <div
            id="docs-search-results"
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
            role="listbox"
            aria-label="Matching guides"
          >
            {groups.map((group, groupIndex) => (
              <div
                key={group.label}
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
                role="group"
                aria-labelledby={`docs-search-group-${groupIndex}`}
                className="mt-2"
              >
                <p
                  id={`docs-search-group-${groupIndex}`}
                  className="text-caption-strong text-ink-2 px-2 py-1"
                >
                  {group.label}
                </p>
                {group.items.map((result) => {
                  const index = results.indexOf(result);
                  return (
                    <a
                      key={result.href}
                      id={optionId(index)}
                      href={result.href}
                      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
                      role="option"
                      tabIndex={-1}
                      aria-selected={index === cursor}
                      data-active={index === cursor}
                      onMouseMove={() => setActive(index)}
                      className={cn(
                        'focus-ring flex h-16 items-start gap-3 rounded-sm p-3 no-underline',
                        index === cursor && 'bg-well',
                      )}
                    >
                      <FileText className="text-ink-2 mt-0.75 size-3.5 shrink-0" aria-hidden />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-label text-ink truncate">
                          <Marked text={result.title} query={query} />
                        </span>
                        <span className="text-body text-ink-2 truncate">
                          <Marked text={result.description} query={query} />
                        </span>
                      </span>
                    </a>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="border-rule text-ink-2 text-caption flex shrink-0 items-center gap-4 border-t px-4 py-2">
          <span className="inline-flex items-center gap-2">
            <Kbd keys={['↑', '↓']} />
            navigate
          </span>
          <span className="inline-flex items-center gap-2">
            <Kbd>↵</Kbd>
            select
          </span>
        </div>
      </dialog>
    </>
  );
}

function Marked({ text, query }: Readonly<{ text: string; query: string }>) {
  let offset = 0;
  return highlight(text, query).map((segment) => {
    const start = offset;
    offset += segment.text.length;
    return segment.match ? (
      <mark key={start} className="cl-mark">
        {segment.text}
      </mark>
    ) : (
      segment.text
    );
  });
}

function searchStatus(
  failed: boolean,
  entries: SearchEntry[] | null,
  query: string,
  count: number,
): string {
  if (failed) return 'Search could not load. Browse the navigation or retry.';
  if (!entries) return 'Loading search…';
  if (!query.trim()) return 'Search titles and the full text of every guide.';
  if (count) return `${count} matching guides`;
  return 'No matching guides. Try fewer words or a feature name.';
}
