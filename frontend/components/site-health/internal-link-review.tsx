import type { InternalLink } from '@citeladder/contracts/site-health';
import { useContext, useState } from 'react';

import { ActionButton } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { PageOpenContext } from '@/components/site-health/page-open-context';
import { Checkbox } from '@/components/ui/checkbox';

import { Section, SectionBleed, SectionHeader, SectionTitle } from '@/components/ui/section';
import { AnchorMark, TextWell } from '@/components/ui/slip';
import { ClampText } from '@/components/ui/clamp-text';
import { CopyButton } from '@/components/ui/copy-button';
import { Drawer } from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { Inline, Stack, Columns } from '@/components/ui/layout';
import { UrlText } from '@/components/ui/table';
import { TextLink } from '@/components/ui/text-link';
import { MarkActionImplemented } from '@/components/agent/action-declaration';
import { FileSearch } from '@/lib/icons';
import { pluralCount } from '@/lib/format';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import { Text } from '@/components/ui/typography';

const escapeHtml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

function LinkEnd({
  label,
  page,
  note,
}: Readonly<{ label: string; page: InternalLink['source']; note?: string }>) {
  const summary = page.description || page.excerpt;
  return (
    <Columns template="label-value" gap="group" align="baseline">
      <Text variant="caption">{label}</Text>
      <Stack gap="tight" className="min-w-0">
        <TextLink
          variant="external"
          text="body"
          className="flex w-fit max-w-full min-w-0 items-center"
          href={page.url}
        >
          {page.title ? (
            <ClampText tooltip={page.url} className="min-w-0">
              {page.title}
            </ClampText>
          ) : (
            <UrlText url={page.url} />
          )}
        </TextLink>
        {summary ? (
          <ClampText lines={2} text="caption">
            {summary}
          </ClampText>
        ) : null}
        {note ? <Text variant="caption">{note}</Text> : null}
      </Stack>
    </Columns>
  );
}

function inboundNote(count: number | null) {
  return count === null
    ? 'Contextual inbound links not counted'
    : pluralCount(count, 'contextual inbound link');
}

export function InternalLinkReview({
  link,
  links,
  workspaceId,
  crawlId,
  stale,
  onClose,
}: Readonly<{
  link: InternalLink | undefined;
  links: InternalLink[];
  workspaceId: string;
  crawlId: string;
  stale: boolean;
  onClose: () => void;
}>) {
  const openPage = useContext(PageOpenContext);
  return (
    <Drawer
      open={Boolean(link)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Review internal link"
    >
      {link ? (
        <>
          <SectionBleed rows>
            <LinkEnd label="From" page={link.source} />
            <LinkEnd
              label="To"
              page={link.target}
              note={inboundNote(link.target.contextual_inbound)}
            />
          </SectionBleed>
          <Section>
            <SectionHeader>
              <SectionTitle>{link.placement ? 'Where it goes' : 'Anchor text'}</SectionTitle>
            </SectionHeader>
            <TextWell>
              {link.placement ? (
                <>
                  {link.placement.text.slice(0, link.placement.anchor_start)}
                  <AnchorMark>{link.anchor}</AnchorMark>
                  {link.placement.text.slice(link.placement.anchor_start + link.anchor.length)}
                </>
              ) : (
                link.anchor
              )}
            </TextWell>
          </Section>
          <Stack gap="item">
            <Inline wrap>
              <CopyButton
                variant="primary"
                value={`<a href="${escapeHtml(link.target.url)}">${escapeHtml(link.anchor)}</a>`}
              >
                Copy HTML
              </CopyButton>
              <CopyButton variant="secondary" value={link.anchor}>
                Copy anchor
              </CopyButton>
              <CopyButton variant="secondary" value={link.target.url}>
                Copy URL
              </CopyButton>
            </Inline>
            <Inline wrap>
              <Button
                variant="quiet"
                aria-haspopup="dialog"
                onClick={() => openPage?.({ crawlId, siteUrlId: link.source.site_url_id })}
              >
                <Icon icon={FileSearch} />
                Source page evidence
              </Button>
              {link.action_id ? (
                <ActionButton action="openAction" href={`/actions/${link.action_id}`} />
              ) : null}
            </Inline>
          </Stack>
          <LinkDeclaration
            key={`${link.source.analysis_id}:${links.map((item) => item.id).join(',')}`}
            link={link}
            links={links}
            workspaceId={workspaceId}
            stale={stale}
          />
        </>
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
  link: InternalLink;
  links: InternalLink[];
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
  const selectedIds = new Set(selected);
  return (
    <Section>
      <SectionHeader>
        <SectionTitle>Which links are live on this page?</SectionTitle>
      </SectionHeader>
      {related.map((item) => (
        <Checkbox
          key={item.id}
          checked={selectedIds.has(item.id)}
          onCheckedChange={(checked) =>
            setSelected((ids) =>
              checked === true ? [...ids, item.id] : ids.filter((id) => id !== item.id),
            )
          }
          label={`${item.anchor} → ${item.target.title || item.target.url}`}
        />
      ))}
      <MarkActionImplemented
        workspaceId={workspaceId}
        actionId={link.action_id}
        revision={null}
        recommendationIds={selected}
        disabled={!selected.length}
      />
    </Section>
  );
}
