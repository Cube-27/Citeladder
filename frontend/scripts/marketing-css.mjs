import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The website's own stylesheets: the shared base MarketingLayout loads, and the
 * per-component sheets that sit next to the components under
 * components/marketing. Design-system checks that judge "the website's CSS"
 * read all of them, so moving a rule between sheets never changes a verdict.
 */
const BASE = 'apps/marketing/src/site-base.css';
const COMPONENT_ROOT = 'components/marketing';

function componentSheets(directory, prefix) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) return componentSheets(join(directory, entry.name), path);
    return entry.name.endsWith('.css') ? [path] : [];
  });
}

/** Repo-relative (frontend/) paths, base first, the rest in a stable order. */
export function marketingCssFiles(root) {
  const sheets = componentSheets(join(root, ...COMPONENT_ROOT.split('/')), COMPONENT_ROOT);
  return [BASE, ...sheets.sort()];
}

/** The website's CSS as one string, sheets joined in `marketingCssFiles` order. */
export function readMarketingCss(root) {
  return marketingCssFiles(root)
    .map((file) => readFileSync(join(root, ...file.split('/')), 'utf8'))
    .join('\n');
}
