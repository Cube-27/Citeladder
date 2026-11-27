export const COMPOSITION_ENFORCED = false;

const ANCESTOR_KEY = /\[(?:data-section\b|role=['"]?dialog\b)/;

function lineAt(source, index) {
  let line = 1;
  for (let at = source.indexOf('\n'); at !== -1 && at < index; at = source.indexOf('\n', at + 1))
    line += 1;
  return line;
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

function ruleHeads(source) {
  const heads = [];
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{' && index > start) heads.push({ start, text: source.slice(start, index + 1) });
    if (char === '{' || char === '}' || char === ';') start = index + 1;
  }
  return heads;
}

export function ancestorRuleFindings(label, css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const findings = [];
  for (const { start, text } of ruleHeads(source)) {
    const selector = text.slice(0, -1).trim();
    if (selector.startsWith('@') || !ANCESTOR_KEY.test(selector)) continue;
    if (keysOnAncestor(selector))
      findings.push(
        `${label}:${lineAt(source, start + text.search(/\S/))}: rule keyed on an ancestor section or dialog`,
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
