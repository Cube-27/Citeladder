/** Linear-time line diff: unchanged prefix/suffix frame the replaced middle block. */
export function robotsLineDiff(before: string, after: string): string {
  if (!before && !after) return '';
  const a = before.split(/\r\n|\r|\n/u);
  const b = after.split(/\r\n|\r|\n/u);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - end - 1] === b[b.length - end - 1]
  )
    end++;
  return [
    ...a.slice(0, start).map((line) => `  ${line}`),
    ...a.slice(start, a.length - end).map((line) => `- ${line}`),
    ...b.slice(start, b.length - end).map((line) => `+ ${line}`),
    ...a.slice(a.length - end).map((line) => `  ${line}`),
  ].join('\n');
}
