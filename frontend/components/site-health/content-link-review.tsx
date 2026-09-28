import type { ContentLink } from '@citeladder/contracts/site-health';
import { useState } from 'react';

import { ProjectLink } from '@/components/layout/scoped-link';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Drawer } from '@/components/ui/drawer';
import { Stack } from '@/components/ui/layout';
import { Checkbox } from '@/components/ui/checkbox';
import { MarkImplementedButton } from '@/components/agent/action-declaration';
import { useWorkspaceCapability } from '@/lib/project/project-context';

export function ContentLinkReview({
  link,
  links,
  workspaceId,
  crawlId,
  stale,
  onClose,
}: Readonly<{
  link: ContentLink | undefined;
  links: ContentLink[];
  workspaceId: string;
  crawlId: string;
  stale: boolean;
  onClose: () => void;
}>) {
  return (
    <Drawer
      open={Boolean(link)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Review internal link"
      description="Link existing text to a useful destination."
    >
      {link ? (
        <Stack gap="section">
          <section className="space-y-3">
            <h3 className="type-section-title">Source passage</h3>
            <a
              className="type-body text-accent-text break-all"
              href={link.source.url}
              target="_blank"
              rel="noreferrer"
            >
              {link.source.title || link.source.url}
            </a>
            {link.passage.heading ? <p className="type-label">{link.passage.heading}</p> : null}
            <p className="type-body">
              {link.passage.text.slice(0, link.anchor.start)}
              <mark className="bg-warning-bg text-warning-text">{link.anchor.text}</mark>
              {link.passage.text.slice(link.anchor.end)}
            </p>
            <Button asChild variant="secondary" size="sm">
              <ProjectLink href={`/site/crawls/${crawlId}/pages/${link.source.site_url_id}`}>
                View page evidence
              </ProjectLink>
            </Button>
          </section>
          <section className="space-y-3">
            <h3 className="type-section-title">Destination</h3>
            <a
              className="type-body text-accent-text break-all"
              href={link.target.url}
              target="_blank"
              rel="noreferrer"
            >
              {link.target.title || link.target.url}
            </a>
            <p className="type-body">{link.target.excerpt}</p>
            <p className="type-caption">
              {link.source.navigation_targets.includes(link.target.url)
                ? 'Already linked in navigation; this suggestion adds a contextual link.'
                : 'No existing contextual link was observed in this crawl.'}
            </p>
          </section>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={link.anchor.text}>Copy anchor</CopyButton>
            <CopyButton value={link.target.url}>Copy URL</CopyButton>
            <CopyButton
              value={`${link.passage.text.slice(0, link.anchor.start)}[${link.anchor.text}](${link.target.url})${link.passage.text.slice(link.anchor.end)}`}
            >
              Copy edit
            </CopyButton>
            {link.action_id ? (
              <Button asChild variant="secondary">
                <ProjectLink href={`/agent/actions/${link.action_id}`}>Open Action</ProjectLink>
              </Button>
            ) : null}
          </div>
          <p className="type-caption">
            Review the edit in your site editor. Copying does not mark it implemented.
          </p>
          <LinkDeclaration
            key={`${link.source.analysis_id}:${links.map((item) => item.id).join(',')}`}
            link={link}
            links={links}
            workspaceId={workspaceId}
            stale={stale}
          />
        </Stack>
      ) : null}
    </Drawer>
  );
}

function LinkDeclaration({
  link,
  links,
  workspaceId,
  stale,
}: Readonly<{
  link: ContentLink;
  links: ContentLink[];
  workspaceId: string;
  stale: boolean;
}>) {
  const canWrite = useWorkspaceCapability('write');
  const [selected, setSelected] = useState<string[]>([]);
  if (
    !canWrite ||
    !link.action_id ||
    stale ||
    !['open', 'in_progress'].includes(link.action_status ?? '')
  )
    return null;
  const related = links.filter((item) => item.source.site_url_id === link.source.site_url_id);
  return (
    <section className="space-y-3">
      <h3 className="type-section-title">Which links are live on this page?</h3>
      <p className="type-body">
        Select every link you have implemented before declaring this page Action.
      </p>
      {related.map((item) => (
        <Checkbox
          key={item.id}
          checked={selected.includes(item.id)}
          onCheckedChange={(checked) =>
            setSelected((ids) =>
              checked === true ? [...ids, item.id] : ids.filter((id) => id !== item.id),
            )
          }
          label={`${item.anchor.text} → ${item.target.title || item.target.url}`}
        />
      ))}
      <MarkImplementedButton
        workspaceId={workspaceId}
        actionId={link.action_id}
        revision={null}
        recommendationIds={selected}
        disabled={!selected.length}
        selectionDescription="Declare that the selected contextual links are live on this source page."
      />
    </section>
  );
}
