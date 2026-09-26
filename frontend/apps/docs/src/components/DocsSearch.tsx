import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { textRole } from '@/components/ui/typography';
import { searchArticles, type SearchEntry } from '../lib/search';

export function DocsSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<SearchEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        trigger.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);

  useEffect(() => {
    if (!open || entries) return;
    const controller = new AbortController();
    void fetch('/search-index.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Search unavailable');
        return response.json() as Promise<SearchEntry[]>;
      })
      .then((data) => {
        setEntries(data);
        setFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [open, entries, attempt]);

  const results = searchArticles(entries ?? [], query);
  return (
    <>
      <Button
        ref={trigger}
        variant="secondary"
        className="w-full justify-start"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" aria-hidden />
        <span>Search docs</span>
        <kbd className="ml-auto hidden text-xs sm:inline">Ctrl K</kbd>
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Search documentation"
        description="Find guides across the product, Agent and MCP."
      >
        <label htmlFor="docs-query" className="sr-only">
          Search terms
        </label>
        <Input
          id="docs-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try outline approval or citations"
        />
        <output className={textRole('meta', 'block py-4')}>
          {failed
            ? 'Search could not load. Browse the navigation or retry.'
            : !entries
              ? 'Loading search…'
              : !query.trim()
                ? 'Search titles and the full text of every guide.'
                : results.length
                  ? `${results.length} matching guides`
                  : 'No matching guides. Try fewer words or a feature name.'}
        </output>
        {failed && (
          <Button
            variant="secondary"
            onClick={() => {
              setFailed(false);
              setAttempt((value) => value + 1);
            }}
          >
            Retry search
          </Button>
        )}
        <ul className="grid gap-1">
          {results.map((result) => (
            <li key={result.href}>
              <a
                href={result.href}
                className="focus-ring hover:bg-accent-soft grid gap-1 rounded-[var(--radius-control)] p-3"
              >
                <span className={textRole('bodyStrong')}>{result.title}</span>
                <span className={textRole('body')}>{result.description}</span>
                <span className={textRole('meta')}>{result.group}</span>
              </a>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
