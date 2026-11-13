import browserslist from 'browserslist';

/**
 * The support matrix and MDN browser-compat-data lookups the browser
 * compatibility gates share (`check-browser-compat.mjs` for scripts,
 * `check-css-compat.mjs` for stylesheets).
 */

const BROWSERS = {
  chrome: 'chrome',
  edge: 'edge',
  firefox: 'firefox',
  safari: 'safari',
  ios_saf: 'safari_ios',
  samsung: 'samsunginternet_android',
};

function versionNumber(version) {
  return String(version)
    .replace(/^≤/, '')
    .split('-')[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(left, right) {
  const a = versionNumber(left);
  const b = versionNumber(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

/** The oldest supported version of each matrix browser, keyed by BCD browser id. */
export function supportMatrix(queries) {
  const matrix = {};
  for (const entry of browserslist(queries)) {
    const [name, version] = entry.split(' ');
    const browser = BROWSERS[name];
    if (!browser) continue;
    if (!matrix[browser] || compareVersions(version, matrix[browser]) < 0) {
      matrix[browser] = version;
    }
  }
  return matrix;
}

// Whether one support statement covers `version`. A partial implementation
// counts: the feature exists, which is all a missing-feature failure depends on.
function covers(statement, version) {
  const added = statement.version_added;
  if (added === false || added === 'preview' || added === null) return false;
  if (added !== true && compareVersions(added, version) > 0) return false;
  const removed = statement.version_removed;
  return !removed || (removed !== true && compareVersions(removed, version) > 0);
}

/** The matrix browsers that lack a BCD feature, as `browser version_added` strings. */
export function unsupported(feature, matrix) {
  const support = feature?.__compat?.support;
  if (!support) return [];
  const missing = [];
  for (const [browser, oldest] of Object.entries(matrix)) {
    // Flagged, prefixed and renamed support is not support for this code.
    const statements = [support[browser]]
      .flat()
      .filter(
        (statement) =>
          statement && !statement.flags && !statement.prefix && !statement.alternative_name,
      );
    // No data is unknown, not absent; only a recorded gap fails.
    if (!statements.length || statements.every((statement) => statement.version_added === null)) {
      continue;
    }
    if (statements.some((statement) => covers(statement, oldest))) continue;
    const added = statements[0].version_added;
    missing.push(`${browser} ${typeof added === 'string' ? added : 'none'}`);
  }
  return missing;
}
