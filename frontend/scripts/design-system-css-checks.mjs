import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import postcss from 'postcss';

/**
 * Hand-written CSS outside the token owner, checked for what breaks rendering:
 * a stylesheet that does not parse, and a custom property that reads itself.
 * Shadows, motion, type, spacing and outlines are the owner's choice and are
 * not policed (owner, 2026-11-20). Every finding is `{ rule, file, line,
 * message }` and is judged by the ratchet (design-system-ratchet.mjs).
 */

const TOKEN_CSS = 'apps/app/src/globals.css';
const SCANNED_ROOTS = ['apps', 'components'];
const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  '.dev',
  '.astro',
  'coverage',
]);

/**
 * Policy findings for one stylesheet. `lineOffset` maps a `<style>` block's
 * lines back onto its Astro file.
 * @public — also imported by the scripts/frontend fixture tests.
 */
export function cssPolicyFindings(css, label, lineOffset = 0) {
  if (label === TOKEN_CSS) return [];
  let root;
  try {
    root = postcss.parse(css, { from: label });
  } catch (error) {
    return [
      {
        rule: 'css-parse',
        file: label,
        line: (error.line ?? 1) + lineOffset,
        message: `could not parse CSS — ${error.reason ?? error.message}`,
      },
    ];
  }
  const findings = [];
  root.walkDecls((decl) => {
    // A custom property that reads itself is a cycle: the browser drops it and
    // every consumer silently falls back to the inherited value.
    if (!decl.prop.startsWith('--') || !decl.value.includes(`var(${decl.prop})`)) return;
    findings.push({
      rule: 'css-cycle',
      file: label,
      line: (decl.source?.start?.line ?? 1) + lineOffset,
      message: `${decl.prop}: ${decl.value.replace(/\s+/g, ' ').trim()} — a custom property must not reference itself`,
    });
  });
  return findings;
}

/**
 * Findings for every `<style>` block in an Astro component.
 * @public — also imported by the scripts/frontend fixture tests.
 */
export function astroStyleFindings(source, label) {
  return [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].flatMap((match) => {
    const start = match.index + match[0].indexOf('>') + 1;
    const lineOffset = source.slice(0, start).split('\n').length - 1;
    return cssPolicyFindings(match[1], label, lineOffset);
  });
}

function stylesheetPaths(directory) {
  return readdirSync(directory).flatMap((name) => {
    if (IGNORED_DIRECTORIES.has(name)) return [];
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return stylesheetPaths(path);
    return /\.(?:css|astro)$/.test(name) ? [path] : [];
  });
}

/** Every CSS and Astro style finding under apps/ and components/. */
export function cssPolicyScan(root) {
  return SCANNED_ROOTS.flatMap((directory) => stylesheetPaths(join(root, directory))).flatMap(
    (path) => {
      const label = relative(root, path);
      const source = readFileSync(path, 'utf8');
      return label.endsWith('.astro')
        ? astroStyleFindings(source, label)
        : cssPolicyFindings(source, label);
    },
  );
}
