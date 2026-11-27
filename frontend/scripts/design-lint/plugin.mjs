import { readFileSync } from 'node:fs';

import { astroClassStrings, frontmatterOf } from './astro.mjs';
import { classValues } from './class-values.mjs';
import {
  colourLiteralIn,
  isArbitraryBreakpoint,
  isMonochrome,
  isStepClass,
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

const UI_SOURCE = /^@\/components\/ui(?:\/|$)/;
const ROLE_PROPERTY =
  /^--(?:color|text|spacing|radius|shadow|font|leading|tracking|container|ease|ramp|control|opacity|z-index|type)(?:-|$)/;

function rootName(name) {
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression') return rootName(name.object);
  return '';
}

function attributeNamed(node, name) {
  return node.attributes.find((item) => item.type === 'JSXAttribute' && item.name.name === name);
}

function roleKeys(style) {
  const object = style?.value?.type === 'JSXExpressionContainer' ? style.value.expression : null;
  if (object?.type !== 'ObjectExpression') return [];
  return object.properties
    .map(
      (property) =>
        property.type === 'Property' && property.key.type === 'Literal' && property.key.value,
    )
    .filter((key) => typeof key === 'string' && ROLE_PROPERTY.test(key));
}

function elementCheck(node, imports) {
  const name = rootName(node.name);
  if (/^[a-z]/.test(name)) return { tag: name, test: isValueClass, kind: 'plain' };
  if (UI_SOURCE.test(imports.get(name) ?? '')) return { tag: name, test: isStepClass, kind: 'ui' };
  return { tag: name, test: isValueClass, kind: 'component' };
}

const ADVICE = {
  plain: 'Render a primitive (Stack, Inline, Text, Section…) or give one a role prop.',
  component: 'Render a primitive (Icon, Stack, Text…) or give one a role prop.',
  ui: 'Spacing between things comes from a layout gap and sizes from a primitive prop or role.',
};

const plainElement = {
  meta: { type: 'problem' },
  create(context) {
    const constants = new Map();
    const imports = new Map();
    const elements = [];
    return {
      ImportDeclaration(node) {
        for (const specifier of node.specifiers)
          imports.set(specifier.local.name, node.source.value);
      },
      VariableDeclarator(node) {
        if (node.id.type === 'Identifier' && node.init && !constants.has(node.id.name))
          constants.set(node.id.name, node.init);
      },
      JSXOpeningElement(node) {
        if (
          /^[a-z]/.test(rootName(node.name)) &&
          node.attributes.some((item) => item.type === 'JSXSpreadAttribute')
        )
          context.report({
            node,
            message: `<${rootName(node.name)}> spreads props, so a caller can pass it any class or style. Render a primitive instead. ${GUIDE}`,
          });
        const keys = roleKeys(attributeNamed(node, 'style'));
        if (keys.length)
          context.report({
            node,
            message: `style re-points ${keys.join(' ')} for one call site. Add a role or a primitive prop instead. ${GUIDE}`,
          });
        const attribute = attributeNamed(node, 'className');
        if (attribute?.value) elements.push({ node, value: attribute.value });
      },
      'Program:exit'() {
        for (const { node, value } of elements) {
          const { tag, test, kind } = elementCheck(node, imports);
          const found = classValues(value, constants);
          const parts = [
            ...found.strings.flatMap(splitTokens).filter(test),
            ...(kind === 'ui' ? [] : found.helpers),
            ...(kind === 'ui' ? [] : found.unreadable.map((name) => `{${name}}`)),
          ];
          if (!parts.length) continue;
          context.report({
            node,
            message: `<${tag}> sets design values itself: ${[...new Set(parts)].slice(0, 6).join(' ')}. ${ADVICE[kind]} ${GUIDE}`,
          });
        }
      },
    };
  },
};

const staticClass = {
  meta: { type: 'problem' },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.name !== 'className' || node.value?.type !== 'JSXExpressionContainer') return;
        const search = (current) => {
          if (!current || typeof current.type !== 'string') return;
          if (current.type === 'TemplateLiteral' && current.expressions.length)
            context.report({
              node: current,
              message: `A class list built in a template literal hides its classes from the design checks. Join conditional classes with cn(). ${GUIDE}`,
            });
          for (const key of [
            'expression',
            'arguments',
            'consequent',
            'alternate',
            'left',
            'right',
            'elements',
          ])
            [current[key]].flat().forEach(search);
        };
        search(node.value.expression);
      },
    };
  },
};

const SIZING_ATTRIBUTES = new Set(['width', 'height', 'className', 'style']);

const rawMedia = {
  meta: { type: 'problem' },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.type !== 'JSXIdentifier') return;
        const tag = node.name.name;
        const sized = node.attributes.some(
          (item) => item.type === 'JSXSpreadAttribute' || SIZING_ATTRIBUTES.has(item.name.name),
        );
        if (tag === 'img' || (tag === 'svg' && sized))
          context.report({
            node,
            message: `<${tag}> sizes a picture itself, so a logo can set its row's height. Render BrandMark for a logo or mark, Avatar for a person and ProductImage for a product photo. ${GUIDE}`,
          });
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
    'arbitrary-breakpoint': tokenRule(
      isArbitraryBreakpoint,
      (token) =>
        `${token} picks a raw breakpoint. Use a named breakpoint or container size (or add one). ${GUIDE}`,
    ),
    'static-class': staticClass,
    'astro-class': astroClass,
    'raw-media': rawMedia,
  },
};

export default plugin;
