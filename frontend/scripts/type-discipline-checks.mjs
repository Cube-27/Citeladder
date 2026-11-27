import { visitorKeys } from 'oxc-parser';

import { lineIndex, parseSource, walk } from './source-ast.mjs';

const OBJECT_KEY_READERS = new Set(['keys', 'entries']);
const RADIX_VALUE_OWNERS = new Set([
  'components/ui/radio-group.tsx',
  'components/ui/select.tsx',
  'components/ui/tabs.tsx',
]);

const propertyName = (node) =>
  node?.type === 'MemberExpression' && !node.computed ? node.property?.name : undefined;

const isNumber = (node) =>
  (node?.type === 'Literal' && typeof node.value === 'number') ||
  (node?.type === 'UnaryExpression' && node.operator === '-' && isNumber(node.argument));

const isSplit = (node) => node?.type === 'CallExpression' && propertyName(node.callee) === 'split';

function keysCast(node) {
  if (node.type !== 'TSAsExpression') return false;
  const call = node.expression;
  return (
    call?.type === 'CallExpression' &&
    OBJECT_KEY_READERS.has(propertyName(call.callee)) &&
    call.callee.object.type === 'Identifier' &&
    call.callee.object.name === 'Object'
  );
}

function indexNonNull(node) {
  if (node.type !== 'TSNonNullExpression') return false;
  const target = node.expression;
  if (target?.type === 'MemberExpression' && target.computed)
    return isNumber(target.property) && !isSplit(target.object);
  if (target?.type === 'CallExpression' && propertyName(target.callee) === 'at')
    return isNumber(target.arguments?.[0]) && !isSplit(target.callee.object);
  return false;
}

const DISCRIMINANTS = new Set([
  'kind',
  'type',
  'status',
  'state',
  'phase',
  'mode',
  'event_type',
  'view',
  'severity',
  'quality_status',
  'dataset_kind',
]);

const discriminantName = (node) =>
  node?.type === 'Identifier' ? node.name : (propertyName(node) ?? '');

const isNever = (annotation) => annotation?.type === 'TSNeverKeyword';

function provesNever(expression) {
  if (expression?.type === 'TSSatisfiesExpression') return isNever(expression.typeAnnotation);
  return (
    expression?.type === 'CallExpression' &&
    expression.callee.type === 'Identifier' &&
    expression.callee.name === 'assertNever'
  );
}

function provesStatement(statement) {
  switch (statement.type) {
    case 'BlockStatement':
      return statement.body.some(provesStatement);
    case 'VariableDeclaration':
      return statement.declarations.some(
        (declarator) => declarator.init && isNever(declarator.id.typeAnnotation?.typeAnnotation),
      );
    case 'ReturnStatement':
    case 'ThrowStatement':
      return provesNever(statement.argument);
    case 'ExpressionStatement':
      return provesNever(statement.expression);
    default:
      return false;
  }
}

const provesExhaustive = (clause) => clause.consequent.some(provesStatement);

function openSwitch(node) {
  if (node.type !== 'SwitchStatement' || !DISCRIMINANTS.has(discriminantName(node.discriminant)))
    return false;
  const fallback = node.cases.find((clause) => clause.test === null);
  return !fallback || !provesExhaustive(fallback);
}

export function nonNullCount(source, label) {
  let count = 0;
  walk(parseSource(source, label), (node) => {
    if (node.type === 'TSNonNullExpression') count += 1;
  });
  return count;
}

export const MAX_PARAMS = 3;
const PARAMETER_HOLDERS = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'TSDeclareFunction',
  'TSEmptyBodyFunctionExpression',
  'TSFunctionType',
]);
const LIBRARY_CALLBACKS = new Set(['onSuccess', 'onMutate', 'onError', 'onSettled']);

const isLibraryCallback = (node, parent) =>
  parent?.type === 'Property' &&
  parent.value === node &&
  !parent.computed &&
  LIBRARY_CALLBACKS.has(parent.key?.name ?? parent.key?.value);

export function maxParamsCount(source, label) {
  let count = 0;
  const visit = (node, parent) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, parent);
      return;
    }
    if (typeof node.type !== 'string') return;
    if (
      PARAMETER_HOLDERS.has(node.type) &&
      node.params.length > MAX_PARAMS &&
      !isLibraryCallback(node, parent)
    )
      count += 1;
    for (const key of visitorKeys[node.type] ?? []) visit(node[key], node);
  };
  visit(parseSource(source, label), null);
  return count;
}

export const RATCHETS = [
  {
    file: 'non-null-baseline.json',
    flag: '--write-non-null-baseline',
    noun: 'non-null assertions',
    fix: 'narrow the value instead of asserting it',
    count: nonNullCount,
  },
  {
    file: 'max-params-baseline.json',
    flag: '--write-max-params-baseline',
    noun: `functions over ${MAX_PARAMS} parameters`,
    fix: 'take one object argument',
    count: maxParamsCount,
  },
];

export function baselineRatchetFailures({ counts, baseline, ratchet }) {
  const files = [...new Set([...Object.keys(counts), ...Object.keys(baseline)])].sort();
  return files.flatMap((file) => {
    const count = counts[file] ?? 0;
    const allowed = baseline[file] ?? 0;
    if (count > allowed)
      return [`${file}: ${count} ${ratchet.noun}, baseline ${allowed}; ${ratchet.fix}`];
    if (count < allowed)
      return [
        `${file}: ${count} ${ratchet.noun}, baseline ${allowed}; lower the entry with ${ratchet.flag}`,
      ];
    return [];
  });
}

export function baselineDiffFailures({ base, baseline, ratchet }) {
  return Object.entries(baseline).flatMap(([file, allowed]) => {
    if (!Object.hasOwn(base, file))
      return [`${ratchet.file}: new entry ${file}; the baseline only shrinks`];
    if (allowed > base[file])
      return [
        `${ratchet.file}: ${file} raised ${base[file]} -> ${allowed}; the baseline only shrinks`,
      ];
    return [];
  });
}

export const loweredBaseline = (counts, baseline) =>
  Object.fromEntries(
    Object.entries(baseline).flatMap(([file, allowed]) => {
      const next = Math.min(allowed, counts[file] ?? 0);
      return next ? [[file, next]] : [];
    }),
  );

const isValueChangeHandler = (node) =>
  node.type === 'JSXAttribute' &&
  node.name?.type === 'JSXIdentifier' &&
  node.name.name === 'onValueChange';

export function typeDisciplineFindings(source, label) {
  const program = parseSource(source, label);
  const lineOf = lineIndex(source);
  const findings = [];
  const add = (node, rule, message) =>
    findings.push({ file: label, rule, line: lineOf(node.start), message });
  const ownsRadixCast = RADIX_VALUE_OWNERS.has(label);
  walk(program, (node) => {
    if (keysCast(node))
      add(
        node,
        'keys-cast',
        'Object.keys/entries cast to a key type; derive the keys from their owner',
      );
    if (indexNonNull(node))
      add(
        node,
        'index-non-null',
        'non-null assertion on an indexed element; make the list non-empty by construction',
      );
    if (openSwitch(node))
      add(
        node,
        'exhaustive-switch',
        'switch on a discriminant without a never arm; end it with a default that assigns to never',
      );
    if (!ownsRadixCast && isValueChangeHandler(node))
      walk(node.value, (inner) => {
        if (inner.type === 'TSAsExpression')
          add(
            inner,
            'value-change-cast',
            'cast in onValueChange; type the generic control by its options',
          );
      });
  });
  return findings;
}
