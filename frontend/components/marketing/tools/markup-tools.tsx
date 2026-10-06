import { useState } from 'react';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { inspectMarkup } from '@/lib/free-tools/markup';
import { buildSchema, type SchemaKind } from '@/lib/free-tools/generators';
import { ToolForm, ToolInput } from './tool-form';

export function MetaChecker() {
  const [html, setHtml] = useState('');
  const [headers, setHeaders] = useState('');
  return (
    <ToolForm
      action="Inspect declarations"
      run={() => inspectMarkup(html, headers)}
      signature={JSON.stringify([html, headers])}
      sample={() => {
        setHtml(
          '<title>Example guide</title>\n<meta name="robots" content="noindex, follow">\n<link rel="canonical" href="https://example.com/guide">',
        );
        setHeaders('HTTP/2 200\nX-Robots-Tag: googlebot: noindex');
      }}
    >
      <ToolInput
        label="Page HTML"
        hint="Paste source HTML. It is inspected locally and never rendered as a webpage."
        value={html}
        onChange={setHtml}
        multiline
      />
      <ToolInput
        label="Response headers (optional)"
        hint="Include X-Robots-Tag and Link headers if available. Do not include cookies or authorization headers."
        value={headers}
        onChange={setHeaders}
        multiline
      />
    </ToolForm>
  );
}

export function StructuredDataBuilder() {
  const [kind, setKind] = useState<SchemaKind>('Article');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [detail, setDetail] = useState('');
  const [date, setDate] = useState('');
  const breadcrumb = kind === 'BreadcrumbList';
  return (
    <ToolForm
      action="Build JSON-LD"
      filename="structured-data.html"
      run={() => buildSchema(kind, name, url, detail, date)}
      signature={JSON.stringify([kind, name, url, detail, date])}
      sample={() => {
        setKind('Article');
        setName('A practical guide to crawl access');
        setUrl('https://example.com/guide');
        setDetail('Alex Morgan');
        setDate('2026-10-06');
      }}
    >
      <Field label="Schema type">
        {(props) => (
          <Select
            {...props}
            ariaLabel="Schema type"
            value={kind}
            options={['Article', 'Organization', 'BreadcrumbList'].map((value) => ({
              value: value as SchemaKind,
              label: value,
            }))}
            onValueChange={(next) => {
              setKind(next);
              setDetail('');
            }}
          />
        )}
      </Field>
      {!breadcrumb && (
        <>
          <ToolInput
            label={kind === 'Article' ? 'Headline' : 'Organization name'}
            value={name}
            onChange={setName}
          />
          <ToolInput label="Page URL" value={url} onChange={setUrl} />
        </>
      )}
      <ToolInput
        label={
          breadcrumb
            ? 'Breadcrumbs'
            : kind === 'Article'
              ? 'Author name (person)'
              : 'Logo URL (optional)'
        }
        hint={
          breadcrumb
            ? 'One Name | https://example.com/path per line, in navigation order.'
            : undefined
        }
        value={detail}
        onChange={setDetail}
        multiline={breadcrumb}
      />
      {kind === 'Article' && (
        <ToolInput label="Publication date" type="date" value={date} onChange={setDate} />
      )}
    </ToolForm>
  );
}
