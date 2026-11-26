import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { FREE_TOOL_LIMIT_LABELS } from '@/lib/config/free-tools';
import { ToolForm, ToolInput } from './tool-form';
import { generateRobots, testRobots, type ToolBot } from '@/lib/free-tools/robots';

const example =
  'User-agent: *\nDisallow: /private/\nAllow: /private/public-guide\n\nUser-agent: GPTBot\nDisallow: /';
function report(body: string, url: string, bots: ToolBot[]) {
  return [
    `Rules test for ${url}`,
    '',
    ...testRobots(body, url, bots).map(
      (row) => `${row.token} · ${row.purpose}\n${row.status}\n${row.evidence}\n`,
    ),
    'This tests supplied robots.txt rules only, not actual access, indexing or citations.',
  ].join('\n');
}

export function CrawlerChecker({ bots }: Readonly<{ bots: ToolBot[] }>) {
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  return (
    <ToolForm
      action="Test crawler rules"
      run={() => report(body, url, bots)}
      signature={JSON.stringify([body, url])}
      sample={() => {
        setBody(example);
        setUrl('https://example.com/private/public-guide');
      }}
    >
      <ToolInput
        label="Page URL to test"
        hint="Only the URL path is tested against your pasted rules. No website is fetched."
        value={url}
        onChange={setUrl}
      />
      <ToolInput
        label="Robots.txt content"
        hint={`An empty file means no declared restrictions. Paste up to ${FREE_TOOL_LIMIT_LABELS.text} characters.`}
        value={body}
        onChange={setBody}
        multiline
      />
    </ToolForm>
  );
}

export function RobotsGenerator({ bots }: Readonly<{ bots: ToolBot[] }>) {
  const [blocked, setBlocked] = useState<string[]>([]);
  const [paths, setPaths] = useState('');
  const [sitemap, setSitemap] = useState('');
  const [testUrl, setTestUrl] = useState('');
  const [testReport, setTestReport] = useState('');
  const signature = JSON.stringify([blocked, paths, sitemap, testUrl]);
  const [testedSignature, setTestedSignature] = useState('');
  return (
    <div className="flex flex-col gap-6">
      <ToolForm
        action="Generate and test rules"
        filename="robots.txt"
        signature={signature}
        sample={() => {
          setBlocked(['GPTBot']);
          setPaths('/private/');
          setSitemap('https://example.com/sitemap.xml');
          setTestUrl('https://example.com/private/');
        }}
        run={() => {
          const text = generateRobots(bots, blocked, paths, sitemap);
          const checked = report(text, testUrl, bots);
          setTestReport(checked);
          setTestedSignature(signature);
          return text;
        }}
      >
        <fieldset className="flex flex-col gap-1">
          <legend className="text-body-sm text-ink mb-2">Block selected crawlers</legend>
          <p className="cl-tool-group-hint">
            Unchecked crawlers follow the general path rules below. Search and training permissions
            are separate choices.
          </p>
          {bots.map((bot) => (
            <Checkbox
              key={bot.label}
              className="[&_button[data-state=unchecked]]:border-control-line [&_button[data-state=unchecked]:hover]:border-ink-2 min-h-6 items-center py-0.5"
              label={`${bot.label} · ${bot.purpose.replaceAll('_', ' ')}`}
              checked={bot.tokens.some((token) => blocked.includes(token))}
              onCheckedChange={(checked) =>
                setBlocked((old) =>
                  checked === true
                    ? [...new Set([...old, ...bot.tokens])]
                    : old.filter((token) => !bot.tokens.includes(token)),
                )
              }
            />
          ))}
        </fieldset>
        <ToolInput
          label="Excluded paths"
          hint="One path per line, such as /private/. Applies to all unblocked crawlers."
          value={paths}
          onChange={setPaths}
          multiline
        />
        <ToolInput label="Sitemap URL (optional)" value={sitemap} onChange={setSitemap} />
        <ToolInput label="Page URL to test generated rules" value={testUrl} onChange={setTestUrl} />
      </ToolForm>
      {testReport && testedSignature === signature && (
        <section className="cl-tool-extra" aria-labelledby="robots-generated-test">
          <h2 id="robots-generated-test" className="cl-tool-rtitle">
            Test of generated rules
          </h2>
          <pre>{testReport}</pre>
        </section>
      )}
    </div>
  );
}
