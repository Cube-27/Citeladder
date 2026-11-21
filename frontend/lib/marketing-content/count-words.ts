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

export function countWord(count: number): string {
  return WORDS[count] ?? count.toLocaleString('en-US');
}

export function countWordCapitalized(count: number): string {
  const word = countWord(count);
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function projectCount(count: number): string {
  return `${countWord(count)} project${count === 1 ? '' : 's'}`;
}
