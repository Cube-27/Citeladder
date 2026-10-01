/** A `LIKE` pattern matching `text` anywhere: `%`, `_` and `\` in it are literal. */
export const containsPattern = (text: string) =>
  `%${text.replaceAll(/[\\%_]/gu, String.raw`\$&`)}%`;
