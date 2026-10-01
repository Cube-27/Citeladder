/** Source links observed inside the primary content, without inferring that they prove a claim. */
import { getDomain } from 'tldts';

import {
  attribute,
  elements,
  parentElement,
  textContent,
  type HtmlElement,
} from '../../web-evidence/html.ts';
import { analysisPolicy, limits, regionPolicy, squash } from './policy.ts';
import { pageOwned, type PageScope } from './regions.ts';

const s = analysisPolicy.facts.source_support;
const ATTRIBUTION = new RegExp(s.attribution_pattern, 'i');
const CITATION = new RegExp(s.citation_marker_pattern, 'i');
const SECTION_HEADINGS = new Set(s.section_headings);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

type AttachedSource = { url: string; domain: string; source_name: string; relationship: string };
export function emptySourceSupport() {
  return {
    primary_content_available: false,
    research_sensitive: false,
    context_reasons: [] as string[],
    attached_sources: [] as AttachedSource[],
    ambiguous_source_count: 0,
    invalid_source_count: 0,
  };
}
type SourceSupport = ReturnType<typeof emptySourceSupport>;

const normalHost = (host: string) => host.toLowerCase().replace(/\.$/u, '');
const registrable = (host: string) => getDomain(host) ?? host;
const sameSite = (host: string, base: string) =>
  host === base || (Boolean(base) && registrable(host) === registrable(base));

/** The external host of an http(s) link, or '' for same-site or non-web links. */
function externalHost(url: URL, base: string) {
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return '';
  const host = normalHost(url.hostname);
  return sameSite(host, base) ? '' : host;
}

function localRelationship(node: HtmlElement) {
  const parent = parentElement(node);
  const parentText = parent ? squash(textContent(parent)).slice(0, limits.meta_chars) : '';
  if (CITATION.test(`${squash(textContent(node))} ${parentText}`)) return 'citation_marker';
  return ATTRIBUTION.test(parentText) ? 'nearby_attribution' : '';
}

function recordAnchor(
  node: HtmlElement,
  section: string,
  finalUrl: string,
  base: string,
  facts: SourceSupport,
) {
  const href = attribute(node, 'href').trim();
  let url: URL;
  try {
    url = new URL(href, finalUrl);
  } catch {
    if (section) facts.invalid_source_count++;
    return;
  }
  const host = externalHost(url, base);
  if (!host) {
    const absolute = href.startsWith('http://') || href.startsWith('https://');
    if (section && absolute && !(url.hostname && base && sameSite(normalHost(url.hostname), base)))
      facts.invalid_source_count++;
    return;
  }
  const relationship = section || localRelationship(node);
  if (!relationship) {
    facts.ambiguous_source_count++;
    return;
  }
  if (facts.attached_sources.length >= s.max_items) return;
  const item = {
    url: url.href.slice(0, limits.url_chars),
    domain: host.slice(0, limits.domain_chars),
    source_name: (squash(textContent(node)) || host).slice(0, limits.name_chars),
    relationship,
  };
  if (!facts.attached_sources.some((other) => JSON.stringify(other) === JSON.stringify(item)))
    facts.attached_sources.push(item);
}

/** A heading opens a references or methodology section; a peer or higher heading closes it. */
function nextSection(node: HtmlElement, current: { name: string; level: number }) {
  const level = Number(node.tagName[1]);
  const heading = squash(textContent(node).toLowerCase()).replace(/^:+|:+$/gu, '');
  if (SECTION_HEADINGS.has(heading))
    return {
      name: heading === 'methodology' ? 'methodology_section' : 'references_section',
      level,
    };
  if (current.name && level <= current.level) return { name: '', level: 0 };
  return current;
}

export function sourceSupportFacts(page: PageScope, finalUrl: string) {
  const facts = emptySourceSupport();
  let base = '';
  try {
    base = normalHost(new URL(finalUrl).hostname);
  } catch {
    return facts;
  }
  facts.primary_content_available = true;
  let section = { name: '', level: 0 };
  let scanned = 0;
  for (const node of elements(page.region)) {
    if (++scanned > regionPolicy.max_containers_scanned) break;
    const isHeading = HEADINGS.has(node.tagName);
    if ((!isHeading && node.tagName !== 'a') || !pageOwned(node, page.region, page.cards)) continue;
    if (isHeading) {
      section = nextSection(node, section);
      if (section.name && !facts.context_reasons.includes(section.name))
        facts.context_reasons.push(section.name);
    } else recordAnchor(node, section.name, finalUrl, base, facts);
  }
  facts.research_sensitive = facts.context_reasons.length > 0;
  return facts;
}
