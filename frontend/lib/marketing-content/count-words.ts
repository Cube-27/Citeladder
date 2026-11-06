const WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

/** A count as copy writes it: words up to ten ("seven"), digits above ("20", "200,000"). */
export function countWord(count: number): string {
  return WORDS[count] ?? count.toLocaleString('en-US');
}

/** `countWord` opening a sentence ("Seven"). */
export function countWordCapitalized(count: number): string {
  const word = countWord(count);
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** "one project", "two projects". */
export function projectCount(count: number): string {
  return `${countWord(count)} project${count === 1 ? '' : 's'}`;
}
