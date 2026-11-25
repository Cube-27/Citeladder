import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

import { __unstable__loadDesignSystem } from 'tailwindcss';

import { textOf } from './design-system-source-checks.mjs';
import { lineIndex, nameText, parseSource, walk } from './source-ast.mjs';

const require = createRequire(import.meta.url);
const CLASS_FUNCTIONS = /^(?:cn|cx|clsx|cva|tv|twMerge|twJoin|textRole|\w+Classes)$/;
const COLOUR_CLASS =
  /^(?:[\w-]+:)*!?(?:text|bg|border(?:-[xytrblse])?|ring|ring-offset|outline|fill|stroke|decoration|divide|placeholder|caret|accent|from|via|to|shadow|inset-ring|inset-shadow)-[a-z][\w-]*(?:\/[\w.]+)?!?$/;

export async function loadDesignSystem(css, base) {
  return __unstable__loadDesignSystem(css, {
    base,
    loadStylesheet: async (id, from) => {
      const path =
        id === 'tailwindcss' ? require.resolve('tailwindcss/index.css') : resolve(from, id);
      return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
    },
  });
}

function classStrings(source, label) {
  const lineOf = lineIndex(source);
  const found = new Map();
  const collect = (node) =>
    walk(node, (inner) => {
      const text = textOf(inner);
      if (text !== null) found.set(inner.start, { text, line: lineOf(inner.start) });
    });
  walk(parseSource(source, label), (node) => {
    if (node.type === 'JSXAttribute' && /^(?:className|class)$/.test(nameText(node.name)))
      collect(node.value);
    else if (node.type === 'CallExpression' && CLASS_FUNCTIONS.test(nameText(node.callee)))
      collect(node.arguments);
  });
  return [...found.values()];
}

export function undeclaredColourViolations(files, designSystem) {
  const uses = files.flatMap(({ label, source }) =>
    classStrings(source, label).flatMap(({ text, line }) =>
      text
        .split(/\s+/)
        .filter((token) => COLOUR_CLASS.test(token))
        .map((token) => ({ token, at: `${label}:${line}` })),
    ),
  );
  const tokens = [...new Set(uses.map((use) => use.token))];
  const css = designSystem.candidatesToCss(tokens);
  const missing = new Set(tokens.filter((_, index) => !css[index]));
  return uses
    .filter((use) => missing.has(use.token))
    .map((use) => `${use.at}: ${use.token} is not a declared theme colour, so it draws nothing`);
}
