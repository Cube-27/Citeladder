import postcss from 'postcss';

import { splitTop } from './design-system-composition.mjs';

const EXTERNAL_READ = /^--(?:default-|spacing$|font-(?:sans|mono)$|removed-body-scroll-bar-size$)/;
const ROOT_COMPOUND =
  /^(?::root|html)?(?:\[data-(?:public|marketing)-surface\]|\[data-theme[^\]]*\]|:not\([^()]*\))*$/;
const VARIANT_VALUE = /\[data-[\w-]+-variant\s*[~|^$*]?=/;

const lineOf = (node) => node.source?.start?.line ?? 0;

function scopeOf(decl) {
  const parts = [];
  for (let node = decl.parent; node && node.type !== 'root'; node = node.parent) {
    if (node.type === 'rule') parts.unshift(node.selector.replace(/\s+/g, ' '));
    if (node.type === 'atrule') parts.unshift(`@${node.name} ${node.params}`.trim());
  }
  return parts.join(' / ');
}

export function duplicateTokenFindings(sheets) {
  const seen = new Map();
  const findings = [];
  for (const { label, css } of sheets)
    postcss.parse(css).walkDecls(/^--/, (decl) => {
      if (decl.value.trim() === 'initial') return;
      const key = `${scopeOf(decl)} :: ${decl.prop}`;
      const first = seen.get(key);
      if (first)
        findings.push(
          `${label}:${lineOf(decl)}: ${decl.prop} declared again in ${scopeOf(decl) || 'the root'} (first at ${first}); one declaration per scope`,
        );
      else seen.set(key, `${label}:${lineOf(decl)}`);
    });
  return findings;
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

const NAMESPACES =
  /^--(?:text-color|transition-duration|transition-property|grid-template-columns|font-weight|z-index|[a-z]+)-/;

export function unreadTokenFindings({ sheets, sources }) {
  const declared = new Map();
  const themed = new Set();
  const utilities = new Map();
  for (const { label, css } of sheets) {
    const root = postcss.parse(css);
    root.walkDecls(/^--/, (decl) => {
      if (decl.prop.endsWith('-*') || decl.value.trim() === 'initial') return;
      if (!declared.has(decl.prop)) declared.set(decl.prop, `${label}:${lineOf(decl)}`);
      if (decl.parent?.type === 'atrule' && decl.parent.name === 'theme') themed.add(decl.prop);
    });
    root.walkAtRules('utility', (rule) => {
      if (!utilities.has(rule.params)) utilities.set(rule.params, `${label}:${lineOf(rule)}`);
    });
  }
  const text = sources.join('\n');
  const used = (pattern) => new RegExp(pattern).test(text);
  const usage = text.replace(/--[\w-]+:/g, '');
  const read = (prop) => {
    const base = prop.split(/(?<=\w)--/)[0];
    if (EXTERNAL_READ.test(base)) return true;
    if (used(String.raw`${escape(base)}(?![\w-])(?!\s*:)`)) return true;
    if (!themed.has(base)) return false;
    const name = base.replace(NAMESPACES, '');
    return new RegExp(String.raw`(?:[-@'"\`])${escape(name)}(?![\w-])`).test(usage);
  };
  const findings = [...declared]
    .filter(([prop]) => !read(prop))
    .map(([prop, at]) => `${at}: ${prop} is never read; delete it`);
  for (const [name, at] of utilities) {
    const stem = name.replace(/-\*$/, '-');
    const pattern = name.endsWith('-*')
      ? String.raw`(?<![\w-])${escape(stem)}`
      : String.raw`(?<![\w-])${escape(name)}(?![\w-])`;
    const uses = text.match(new RegExp(pattern, 'g'))?.length ?? 0;
    if (uses < 2) findings.push(`${at}: @utility ${name} is never used; delete it`);
  }
  return findings;
}

export function variantAncestorFindings(label, css) {
  const findings = [];
  postcss.parse(css).walkRules((rule) => {
    if (!VARIANT_VALUE.test(rule.selector)) return;
    const flagged = splitTop(rule.selector, /,/).some((complex) => {
      const compounds = splitTop(complex, /[\s>+~]/);
      const at = compounds.findIndex((compound) => VARIANT_VALUE.test(compound));
      return at > 0 && compounds.slice(0, at).some((compound) => !ROOT_COMPOUND.test(compound));
    });
    if (flagged)
      findings.push(
        `${label}:${lineOf(rule)}: selects a primitive's variant from an ancestor; give the primitive a variant instead`,
      );
  });
  return findings;
}
