import { execFileSync } from 'node:child_process';

export function gitPaths(root, arguments_) {
  const args = ['-c', 'core.quotePath=false', '-C', root, ...arguments_];
  return execFileSync('git', args, { encoding: 'utf8' }) // NOSONAR
    .split('\n')
    .filter(Boolean);
}

export function workingDiffPaths(root) {
  const mergeBase = gitPaths(root, ['merge-base', 'origin/main', 'HEAD'])[0];
  const pathSets = [
    gitPaths(root, [
      'diff',
      '--no-renames',
      '--name-only',
      '--diff-filter=ACMDT',
      `${mergeBase}..HEAD`,
    ]),
    gitPaths(root, ['diff', '--no-renames', '--name-only', '--diff-filter=ACMDT']),
    gitPaths(root, ['diff', '--cached', '--no-renames', '--name-only', '--diff-filter=ACMDT']),
    gitPaths(root, ['ls-files', '--others', '--exclude-standard']),
  ];
  return [...new Set(pathSets.flat())];
}
