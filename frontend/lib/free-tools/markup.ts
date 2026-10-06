import { boundedText } from './input';

function directiveWarnings(rules: string[], canonicalCount: number) {
  const warnings: string[] = [];
  const restricted = rules.some((rule) => /\b(noindex|none)\b/i.test(rule));
  if (restricted)
    warnings.push('An indexing restriction is declared. Review its crawler scope below.');
  if (canonicalCount > 1)
    warnings.push('Multiple canonical declarations: review them for conflicting targets.');
  if (restricted && rules.some((rule) => /\bindex\b/i.test(rule)))
    warnings.push(
      'Both index and noindex are present. Their effect depends on crawler scope; an index declaration does not cancel an applicable noindex.',
    );
  return warnings;
}

export function inspectMarkup(html: string, headers: string) {
  boundedText(html);
  boundedText(headers);
  if (!html.trim() && !headers.trim())
    throw new Error('Paste HTML or response headers to inspect.');
  // Template contents remain inert: no execution, image loads or insertion into the live page.
  const template = document.createElement('template');
  template.innerHTML = html;
  const root = template.content;
  const directives = Array.from(root.querySelectorAll('meta[name]'))
    .filter((node) => /^(robots|googlebot|bingbot)$/i.test(node.getAttribute('name') ?? ''))
    .map((node) => `${node.getAttribute('name')}: ${node.getAttribute('content') ?? '(empty)'}`);
  const headerRules = headers
    .split(/\r?\n/)
    .filter((line) => /^x-robots-tag\s*:/i.test(line.trim()));
  const canonicals = Array.from(root.querySelectorAll('link[rel]'))
    .filter((node) => node.getAttribute('rel')?.toLowerCase().split(/\s+/).includes('canonical'))
    .map((node) => node.getAttribute('href') ?? '(empty)');
  const headerCanonicals = headers
    .split(/\r?\n/)
    .filter((line) => /^link\s*:/i.test(line.trim()) && /\bcanonical\b/i.test(line));
  const rules = [...directives, ...headerRules];
  const warnings = directiveWarnings(rules, canonicals.length + headerCanonicals.length);
  return [
    `Title: ${root.querySelector('title')?.textContent?.trim() || 'Not supplied'}`,
    `Description: ${root.querySelector('meta[name="description" i]')?.getAttribute('content') || 'Not supplied'}`,
    '',
    'Indexing declarations:',
    ...(rules.length ? rules : ['None found in supplied input. This does not prove indexability.']),
    '',
    'Canonical declarations:',
    ...canonicals,
    ...headerCanonicals,
    ...(!canonicals.length && !headerCanonicals.length ? ['None found in supplied input.'] : []),
    '',
    'Observations:',
    ...(warnings.length ? warnings : ['No selected conflicts detected in supplied input.']),
    '',
    headers.trim()
      ? 'Only pasted response headers were inspected.'
      : 'Response headers were not supplied; X-Robots-Tag is unknown.',
    'Live access, robots.txt, rendered HTML and actual indexing were not checked.',
  ].join('\n');
}
