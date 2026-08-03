'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getSiteHealthAdvancedControlsEnabled } from '@/lib/config/operational';
import { siteHealthApi, type CreateCrawlInput } from '@/lib/api/site-health';

const PAGE_TYPES = ['homepage', 'product', 'category', 'service', 'local', 'article', 'guide', 'comparison', 'faq', 'docs', 'pricing', 'about_contact', 'case_study_review', 'trust_policy', 'other'];

/** Development-only guided admission flow. The preview endpoint owns validation. */
export function CrawlIntakeDialog({ projectId, open, onClose, onStart }: Readonly<{ projectId: string; open: boolean; onClose: () => void; onStart: (input: CreateCrawlInput) => void }>) {
  const advanced = getSiteHealthAdvancedControlsEnabled();
  const [urls, setUrls] = useState('');
  const [mode, setMode] = useState<CreateCrawlInput['input_mode']>('auto');
  const [limit, setLimit] = useState('10');
  const [types, setTypes] = useState<string[]>([]);
  const preview = useMutation({ mutationFn: () => siteHealthApi.previewUrls({ project_id: projectId, content: urls, input_format: 'text' }) });
  if (!open) return null;
  const start = () => {
    onStart({ project_id: projectId, ...(advanced ? { input_mode: mode, requested_page_limit: Number(limit), seed_urls: urls.split(/\r?\n/).map((value) => value.trim()).filter(Boolean), page_types: types } : {}) });
    onClose();
  };
  return <div className="bg-overlay-scrim z-modal fixed inset-0 grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="crawl-intake-title">
    <div className="bg-elevated shadow-modal-value grid max-h-full w-full max-w-2xl gap-4 overflow-auto rounded-lg p-5">
      <div><h2 id="crawl-intake-title" className="text-foreground text-heading-sm">Choose pages to crawl</h2><p className="text-muted mt-1 text-sm">URLs are checked before a request is ever created. Excluded and out-of-scope URLs are not fetched.</p></div>
      {!advanced ? <Alert tone="info">This crawl will automatically analyze up to 10 pages.</Alert> : <>
        <label className="grid gap-1 text-sm"><span className="text-foreground">URLs or upload contents</span><textarea className="border-border bg-background min-h-28 rounded-md border p-2" value={urls} onChange={(event) => setUrls(event.target.value)} placeholder="https://example.com/product" /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm"><span>Mode</span><select className="border-border bg-background rounded-md border p-2" value={mode} onChange={(event) => setMode(event.target.value as CreateCrawlInput['input_mode'])}><option value="auto">Automatic</option><option value="exact_urls">Exact URLs</option><option value="discovery_seeds">Discovery seeds</option></select></label><label className="grid gap-1 text-sm"><span>Page budget</span><input className="border-border bg-background rounded-md border p-2" type="number" min="1" value={limit} onChange={(event) => setLimit(event.target.value)} /></label></div>
        <fieldset className="grid gap-2"><legend className="text-sm">Page types</legend><div className="flex flex-wrap gap-2">{PAGE_TYPES.map((type) => <label key={type} className="text-sm"><input type="checkbox" checked={types.includes(type)} onChange={() => setTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type])} /> <span className="ms-1">{type.replaceAll('_', ' ')}</span></label>)}</div></fieldset>
        <div className="flex justify-end"><Button variant="secondary" size="sm" onClick={() => preview.mutate()} disabled={!urls || preview.isPending}>{preview.isPending ? 'Checking…' : 'Preview URLs'}</Button></div>
        {preview.data ? <div className="border-border-subtle grid gap-2 rounded-lg border p-3"><p className="text-foreground text-sm">{preview.data.items.filter((item) => item.accepted).length} accepted · {preview.data.items.filter((item) => !item.accepted).length} excluded</p><ul className="text-muted grid gap-1 text-xs">{preview.data.items.slice(0, 12).map((item) => <li key={`${item.row}-${item.input}`}>{item.accepted ? item.canonical_url : `${item.input} — ${item.reason_code ?? 'not accepted'}`}</li>)}</ul>{preview.data.truncated ? <p className="text-muted text-xs">Preview truncated.</p> : null}</div> : null}
        {preview.isError ? <Alert tone="danger">Could not preview these URLs. Please try again.</Alert> : null}
      </>}
      <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={start} disabled={advanced && mode === 'exact_urls' && !urls.trim()}>Start crawl</Button></div>
    </div>
  </div>;
}
