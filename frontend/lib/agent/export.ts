import { saveBlob } from '@/lib/download';
import { markdownHtml, markdownPlainText } from '@/lib/markdown/html';

function exportFilename(title: string, extension: 'md' | 'html'): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `${slug || 'agent-output'}.${extension}`;
}

export function outputMarkdown(title: string, body: string): string {
  return `# ${title}\n\n${body.trimEnd()}\n`;
}

export function downloadOutputMarkdown(title: string, body: string): void {
  saveBlob(
    new Blob([outputMarkdown(title, body)], { type: 'text/markdown;charset=utf-8' }),
    exportFilename(title, 'md'),
  );
}

export type PageExportFormat = 'markdown' | 'html' | 'text';

const ESCAPED: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

const escapeHtml = (text: string) => text.replaceAll(/[&<>"]/g, (char) => ESCAPED[char] ?? char);

export function pageExport(body: string, format: PageExportFormat): string {
  if (format === 'html') return markdownHtml(body);
  if (format === 'text') return `${markdownPlainText(body)}\n`;
  return `${body.trimEnd()}\n`;
}

export type PageDownload = Readonly<{
  title: string;
  body: string;
  fields: Readonly<{ meta_description: string; json_ld: string }> | null;
}>;

function headFields(fields: PageDownload['fields']): string[] {
  if (!fields) return [];
  const description = fields.meta_description.trim();
  const jsonLd = fields.json_ld.trim();
  return [
    ...(description ? [`<meta name="description" content="${escapeHtml(description)}">`] : []),
    ...(jsonLd
      ? [`<script type="application/ld+json">${jsonLd.replaceAll('</', '<\\/')}</script>`]
      : []),
  ];
}

function pageHtmlDocument({ title, body, fields }: PageDownload): string {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    ...headFields(fields),
    '</head>',
    '<body>',
    markdownHtml(body),
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

const frontMatterValue = (text: string) => JSON.stringify(text.trim());

function pageMarkdownDocument({ title, body, fields }: PageDownload): string {
  if (!fields) return pageExport(body, 'markdown');
  return [
    '---',
    `title: ${frontMatterValue(title)}`,
    `description: ${frontMatterValue(fields.meta_description)}`,
    '---',
    '',
    pageExport(body, 'markdown'),
  ].join('\n');
}

export function downloadPage(page: PageDownload, extension: 'md' | 'html'): void {
  const blob =
    extension === 'html'
      ? new Blob([pageHtmlDocument(page)], { type: 'text/html;charset=utf-8' })
      : new Blob([pageMarkdownDocument(page)], { type: 'text/markdown;charset=utf-8' });
  saveBlob(blob, exportFilename(page.title, extension));
}
