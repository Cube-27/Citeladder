import { lineIndex, parseSource, walk } from './source-ast.mjs';

const GEOMETRY = new Set(['strokeWidth', 'strokeDasharray', 'fontSize', 'r']);
const RAW_LENGTH = /(?<![\w.-])(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em)\b/;
const DIGIT = /\d/;

export const UI_SOURCE = /^components\/ui\/.*(?<!\.test)\.tsx?$/;

function rawNumber(node) {
  if (!node) return false;
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'number' ? node.value !== 0 : DIGIT.test(String(node.value));
    case 'UnaryExpression':
      return rawNumber(node.argument);
    case 'ConditionalExpression':
      return rawNumber(node.consequent) || rawNumber(node.alternate);
    case 'TemplateLiteral':
      return node.expressions.length === 0 && DIGIT.test(node.quasis[0]?.value.cooked ?? '');
    case 'JSXExpressionContainer':
      return rawNumber(node.expression);
    default:
      return false;
  }
}

const keyName = (key) => key?.name ?? key?.value;

function stringText(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateElement') return node.value.cooked;
  return null;
}

function finding(node) {
  if (node.type === 'JSXAttribute' && GEOMETRY.has(keyName(node.name)) && rawNumber(node.value))
    return `${keyName(node.name)} holds a raw number`;
  if (node.type === 'Property' && GEOMETRY.has(keyName(node.key)) && rawNumber(node.value))
    return `${keyName(node.key)} holds a raw number`;
  const text = stringText(node);
  const length = text === null ? null : RAW_LENGTH.exec(text);
  return length ? `"${length[0]}" is a raw length` : null;
}

export function uiValueFindings(label, source) {
  const line = lineIndex(source);
  const findings = [];
  walk(parseSource(source, label), (node) => {
    const problem = finding(node);
    if (problem) findings.push(`${label}:${line(node.start)}: ${problem}; use a role token`);
  });
  return findings;
}
