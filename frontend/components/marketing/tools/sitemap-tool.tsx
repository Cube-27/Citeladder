import { useRef, useState } from 'react';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { readToolFile } from '@/lib/free-tools/input';
import { compareSitemaps } from '@/lib/free-tools/sitemap';
import { ToolForm, ToolInput } from './tool-form';

function SitemapInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [error, setError] = useState('');
  const generation = useRef(0);
  return (
    <div className="flex flex-col gap-3">
      <Field
        label={`Upload ${label.toLowerCase()}`}
        hint="Uncompressed UTF-8 XML, up to 1 MB and 200,000 characters."
        error={error}
      >
        {(props) => (
          <Input
            {...props}
            type="file"
            accept=".xml,text/xml,application/xml"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              const current = ++generation.current;
              if (!file) return;
              event.target.value = '';
              try {
                const text = await readToolFile(file);
                if (generation.current === current) {
                  onChange(text);
                  setError('');
                }
              } catch (cause) {
                if (generation.current === current)
                  setError(cause instanceof Error ? cause.message : 'Could not read file.');
              }
            }}
          />
        )}
      </Field>
      <ToolInput
        label={label}
        value={value}
        onChange={(text) => {
          generation.current++;
          onChange(text);
          setError('');
        }}
        multiline
      />
    </div>
  );
}
const xml = (paths: string[]) =>
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((path) => `  <url><loc>https://example.com/${path}</loc></url>`).join('\n')}\n</urlset>`;
export function SitemapComparison() {
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  return (
    <ToolForm
      action="Compare sitemaps"
      signature={JSON.stringify([before, after])}
      sample={() => {
        setBefore(xml(['', 'old-guide']));
        setAfter(xml(['', 'new-guide']));
      }}
      run={() => {
        const result = compareSitemaps(before, after);
        return [
          `Comparing ${result.kind === 'url' ? 'page URLs' : 'child sitemap URLs (not their contents)'}`,
          `Duplicate entries ignored: ${result.duplicates}`,
          '',
          `Added (${result.added.length})`,
          ...result.added,
          '',
          `Removed (${result.removed.length})`,
          ...result.removed,
          '',
          `Unchanged (${result.kept.length})`,
          ...result.kept,
        ].join('\n');
      }}
    >
      <SitemapInput label="Previous sitemap XML" value={before} onChange={setBefore} />
      <SitemapInput label="Current sitemap XML" value={after} onChange={setAfter} />
    </ToolForm>
  );
}
