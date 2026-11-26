import { readFileSync } from 'node:fs';

import { astroClassStrings, frontmatterOf } from './astro.mjs';
import { classValues } from './class-values.mjs';
import {
  colourLiteralIn,
  isMonochrome,
  isSurfaceVariant,
  isSurvivor,
  isValueClass,
  splitTokens,
} from './classes.mjs';

const GUIDE = 'See docs/design.md#design-values.';
const MODULE_SOURCE = new Set([
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
  'ImportExpression',
  'TSExternalModuleReference',
  'TSImportType',
]);

function stringRule(check) {
  return {
    meta: { type: 'problem' },
    create(context) {
      const visit = (node, text) => {
        if (typeof text !== 'string' || MODULE_SOURCE.has(node.parent?.type)) return;
        for (const message of check(text)) context.report({ node, message });
      };
      return {
        Literal: (node) => visit(node, node.value),
        TemplateElement: (node) => visit(node, node.value.cooked ?? node.value.raw),
      };
    },
  };
}

const tokenRule = (test, describe) =>
  stringRule((text) => splitTokens(text).filter(test).map(describe));

const plainElement = {
  meta: { type: 'problem' },
  create(context) {
    const constants = new Map();
    const elements = [];
    return {
      VariableDeclarator(node) {
        if (node.id.type === 'Identifier' && node.init && !constants.has(node.id.name))
          constants.set(node.id.name, node.init);
      },
      JSXOpeningElement(node) {
        if (node.name.type !== 'JSXIdentifier' || !/^[a-z]/.test(node.name.name)) return;
        const attribute = node.attributes.find(
          (item) => item.type === 'JSXAttribute' && item.name.name === 'className',
        );
        if (attribute?.value) elements.push({ node, tag: node.name.name, value: attribute.value });
      },
      'Program:exit'() {
        for (const { node, tag, value } of elements) {
          const found = classValues(value, constants);
          const parts = [
            ...found.strings.flatMap(splitTokens).filter(isValueClass),
            ...found.roles.map((role) => `textRole('${role}')`),
            ...found.helpers,
            ...found.unreadable.map((name) => `{${name}}`),
          ];
          if (!parts.length) continue;
          context.report({
            node,
            message: `<${tag}> sets design values itself: ${[...new Set(parts)].slice(0, 6).join(' ')}. Render a primitive (Stack, Inline, Text, Section…) or give one a role prop. ${GUIDE}`,
          });
        }
      },
    };
  },
};

const astroClass = {
  meta: { type: 'problem' },
  create(context) {
    return {
      Program(node) {
        const path = context.filename;
        if (!path.endsWith('.astro')) return;
        const source = readFileSync(path, 'utf8');
        if (frontmatterOf(source)?.trim() !== context.sourceCode.text.trim()) return;
        for (const { text, line } of astroClassStrings(source)) {
          const values = splitTokens(text).filter((token) => isValueClass(token));
          if (values.length)
            context.report({
              node,
              message: `Line ${line}: markup sets design values itself: ${values.slice(0, 6).join(' ')}. Use a component class whose CSS reads role tokens. ${GUIDE}`,
            });
        }
      },
    };
  },
};

const plugin = {
  meta: { name: 'design' },
  rules: {
    'plain-element': plainElement,
    'reset-survivor': tokenRule(
      isSurvivor,
      (token) =>
        `${token} is a raw step that survives the theme reset. Use a role token (or add one). ${GUIDE}`,
    ),
    'monochrome-colour': tokenRule(
      isMonochrome,
      (token) => `${token}: the theme has no white or black. Use a colour role. ${GUIDE}`,
    ),
    'surface-variant': tokenRule(
      isSurfaceVariant,
      (token) =>
        `${token} forks a look per call site. Re-point a role token for the website instead. ${GUIDE}`,
    ),
    'colour-literal': stringRule((text) => {
      const literal = colourLiteralIn(text);
      return literal
        ? [`${literal} is a raw colour. Colours come from role tokens in globals.css. ${GUIDE}`]
        : [];
    }),
    'astro-class': astroClass,
  },
};

export default plugin;
