const blank = (text) => text.replace(/[^\n]/g, ' ');

export function frontmatterOf(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  return match ? match[1] : null;
}

export function astroClassStrings(source) {
  const markup = source
    .replace(/^---[\s\S]*?\n---/, blank)
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/g, blank);
  const found = [];
  for (const match of markup.matchAll(/\bclass="([^"]*)"/g))
    found.push({ text: match[1], index: match.index });
  for (const match of markup.matchAll(/\bclass=\{`([^`]*)`\}/g))
    found.push({ text: match[1].replace(/\$\{[^}]*\}/g, ' '), index: match.index });
  for (const match of markup.matchAll(/\bclass:list=\{([\s\S]*?)\}\s*[/>\s]/g))
    for (const quoted of match[1].matchAll(/['"`]([^'"`]*)['"`]/g))
      found.push({ text: quoted[1], index: match.index });
  return found.map(({ text, index }) => ({
    text,
    line: markup.slice(0, index).split('\n').length,
  }));
}
