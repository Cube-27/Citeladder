import { execFileSync } from 'node:child_process';

/** Lines of a git command's output as forward-slash paths. */
export function gitPaths(root, arguments_) {
  // Developer tooling runs `git` from the caller's PATH; a pinned absolute path would not be portable.
  return execFileSync('git', ['-C', root, ...arguments_], { encoding: 'utf8' }) // NOSONAR: trusted PATH.
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((path) => path.replaceAll('\\', '/'));
}

/** The branch's changes against origin/main: committed, unstaged, staged and untracked. */
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
