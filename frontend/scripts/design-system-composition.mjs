export const COMPOSITION_ENFORCED = false;

export const QUOTED_WELLS = new Map([
  ['components/ai-traffic/gcp-pull-setup.tsx', 'the Cloud Shell commands and sink filter to copy'],
  ['components/site-health/internal-link-review.tsx', 'the anchor text quoted from the page'],
]);

const NEGATIVE_MARGIN = /(?<![\w-])-m[xytblrse]?-(?:\[[^\]\s]+\]|\([^)\s]+\)|[\d.]+|px)(?![\w-])/g;
const LAYOUT_FACE =
  /\b(?:slipClasses|SLIP_FACE|FRAMED_FACE|STEP_SLIP|wellClasses)\b|(?<![\w-])surface-card(?![\w-])/g;
const ANCESTOR_KEY = /\[(?:data-section\b|role=['"]?dialog\b)/;

const featureCode = (label) =>
  /^(?:apps\/app\/src|components)\/.+\.tsx$/.test(label) &&
  !/^components\/(?:ui|marketing)\//.test(label) &&
  !/\.(?:test|spec)\.tsx$/.test(label);

function lineAt(source, index) {
  let line = 1;
  for (let at = source.indexOf('\n'); at !== -1 && at < index; at = source.indexOf('\n', at + 1))
    line += 1;
  return line;
}

export function compositionFindings(label, source) {
  if (!featureCode(label)) return [];
  const findings = [];
  for (const match of source.matchAll(NEGATIVE_MARGIN))
    findings.push(
      `${label}:${lineAt(source, match.index)}: negative margin ${match[0]} outside components/ui`,
    );
  for (const match of source.matchAll(LAYOUT_FACE)) {
    if (/^import\b/m.test(source.slice(source.lastIndexOf('\n', match.index) + 1, match.index + 1)))
      continue;
    if (match[0] === 'wellClasses' && QUOTED_WELLS.has(label)) continue;
    findings.push(`${label}:${lineAt(source, match.index)}: ${match[0]} used as a layout card`);
  }
  return findings;
}

function splitTop(text, separator) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    else if (depth === 0 && separator.test(char)) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

function keysOnAncestor(selector) {
  return splitTop(selector, /,/).some((complex) => {
    const compounds = splitTop(complex, /[\s>+~]/);
    if (compounds.slice(0, -1).some((compound) => ANCESTOR_KEY.test(compound))) return true;
    return [...complex.matchAll(/:(?:is|where|not|has)\(/g)].some((match) => {
      let depth = 1;
      let end = match.index + match[0].length;
      while (end < complex.length && depth > 0) {
        if (complex[end] === '(') depth += 1;
        if (complex[end] === ')') depth -= 1;
        end += 1;
      }
      return keysOnAncestor(complex.slice(match.index + match[0].length, end - 1));
    });
  });
}

export function ancestorRuleFindings(label, css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const findings = [];
  for (const match of source.matchAll(/([^{};]+)\{/g)) {
    const selector = match[1].trim();
    if (selector.startsWith('@') || !ANCESTOR_KEY.test(selector)) continue;
    if (keysOnAncestor(selector))
      findings.push(
        `${label}:${lineAt(source, match.index + match[0].search(/\S/))}: rule keyed on an ancestor section or dialog`,
      );
  }
  return findings;
}

export function compositionReport(findings) {
  const perFile = new Map();
  for (const finding of findings) {
    const file = finding.slice(0, finding.indexOf(':'));
    perFile.set(file, (perFile.get(file) ?? 0) + 1);
  }
  const lines = [...perFile]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, count]) => `  ${count}\t${file}`);
  return [`Composition findings: ${findings.length} in ${perFile.size} files`, ...lines].join('\n');
}
