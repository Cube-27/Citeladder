import robotsParser from 'robots-parser';
import { boundedText, webUrl } from './input';

export type ToolBot = { label: string; purpose: string; tokens: string[] };

export function testRobots(body: string, target: string, bots: ToolBot[]) {
  boundedText(body);
  const url = new URL(webUrl(target));
  if (/<\s*(?:!doctype|html|body)\b/i.test(body))
    throw new Error('This looks like HTML. Paste the plain-text robots.txt file.');
  if (body.trim() && !/^\s*user-agent\s*:/im.test(body))
    throw new Error(
      'No User-agent group found. Paste a robots.txt file, or leave it empty to test an empty file.',
    );
  const parser = robotsParser(`${url.origin}/robots.txt`, body);
  const lines = body.split(/\r?\n/);
  return bots.flatMap((bot) =>
    bot.tokens.map((token) => {
      const allowed = parser.isAllowed(url.href, token);
      const line = parser.getMatchingLineNumber(url.href, token);
      return {
        bot: bot.label,
        token,
        purpose: bot.purpose.replaceAll('_', ' '),
        status:
          allowed === undefined
            ? 'Unable to determine'
            : allowed
              ? 'Allowed by supplied rules'
              : 'Blocked by supplied rules',
        evidence:
          line > 0
            ? `Line ${line}: ${lines[line - 1]}`
            : 'No matching restriction; default permission applies.',
      };
    }),
  );
}

export function generateRobots(bots: ToolBot[], blocked: string[], paths: string, sitemap: string) {
  boundedText(paths);
  const exclusions = paths
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(Boolean);
  if (exclusions.some((path) => !path.startsWith('/') || /[#\s]/u.test(path)))
    throw new Error('Each excluded path must start with / and contain no spaces or comments.');
  const rules = ['User-agent: *', ...exclusions.map((path) => `Disallow: ${path}`)];
  if (!exclusions.length) rules.push('Disallow:');
  for (const bot of bots) {
    if (bot.tokens.some((token) => blocked.includes(token))) {
      rules.push('', ...bot.tokens.map((token) => `User-agent: ${token}`), 'Disallow: /');
    }
  }
  if (sitemap.trim()) rules.push('', `Sitemap: ${webUrl(sitemap)}`);
  return `${rules.join('\n')}\n`;
}
