/**
 * Shared atoms the website still renders and the app never imports: they keep
 * the website's names until the website is redesigned.
 */
const WEBSITE_ONLY_OWNERS = {
  badge: 'StatusMark or Tag',
  rungs: 'RungMark',
  citation: 'CitationMark',
  callout: 'Notice',
  card: 'Section, Slip or Well',
  'trend-chart': 'StepChart',
  sparkline: 'StepChart',
};

export const WEBSITE_ONLY_UI = new Set(
  Object.keys(WEBSITE_ONLY_OWNERS).map((name) => `components/ui/${name}.tsx`),
);

/** App code may not import a website-only atom or organism; it has the app's own. */
export function websiteOnlyImportViolations(source, label, ownsProductUi) {
  if (!ownsProductUi || WEBSITE_ONLY_UI.has(label)) return [];
  const names = Object.keys(WEBSITE_ONLY_OWNERS).join('|');
  const imports = new RegExp(`from ['"]@/components/ui/(${names})['"]`, 'g');
  return [...source.matchAll(imports)].map(
    ([, name]) =>
      `${label}: ui/${name} is the website's; the app uses ${WEBSITE_ONLY_OWNERS[name]}`,
  );
}
