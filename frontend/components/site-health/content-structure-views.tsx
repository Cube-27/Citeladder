import type { ContentLink, ContentStructure } from '@citeladder/contracts/site-health';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TablePagination, useTablePage } from '@/components/ui/table-pagination';
import { ICONS } from '@/lib/icons';
import { TABLE_DEFAULT_PAGE_SIZE } from '@/lib/config/tables';

export function ContentLinksTable({
  links,
  onSelect,
}: Readonly<{ links: ContentLink[]; onSelect: (id: string) => void }>) {
  const pagination = useTablePage(links.length, TABLE_DEFAULT_PAGE_SIZE);
  if (!links.length)
    return (
      <EmptyState
        icon={ICONS.site}
        heading="No link suggestions to review"
        description="No link suggestions meet the review criteria for this selection. See analysis details for coverage and exclusions."
      />
    );
  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Source page</TableHead>
            <TableHead>Destination</TableHead>
            <TableHead>Suggested anchor</TableHead>
            <TableHead>Review</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {links.slice(pagination.from - 1, pagination.to).map((link) => (
            <TableRow key={link.id}>
              <TableCell>{link.source.title || link.source.url}</TableCell>
              <TableCell>{link.target.title || link.target.url}</TableCell>
              <TableCell>{link.anchor.text}</TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelect(link.id)}
                  aria-label={`Review link from ${link.source.title} to ${link.target.title}`}
                >
                  Review
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TablePagination
        {...pagination}
        total={links.length}
        noun="suggestions"
        onPageChange={pagination.setPage}
      />
    </div>
  );
}

export function ContentTopics({
  analysis,
  links,
  selectedId,
  onSelect,
  onReview,
}: Readonly<{
  analysis: ContentStructure;
  links: ContentLink[];
  selectedId: string;
  onSelect: (id: string) => void;
  onReview: (id: string) => void;
}>) {
  const selected = analysis.topics.find((topic) => topic.id === selectedId);
  if (selected)
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => onSelect('')}>
          All topics
        </Button>
        <h2 className="type-section-title">{selected.label}</h2>
        <p className="type-body">
          {selected.contextual_links} observed contextual links ·{' '}
          {selected.recommendation_ids.length} link suggestions
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member page</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {analysis.pages
              .filter((page) => selected.page_ids.includes(page.analysis_id))
              .map((page) => (
                <TableRow key={page.analysis_id}>
                  <TableCell>
                    <a
                      className="text-accent-text"
                      href={page.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {page.title || page.url}
                    </a>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        <ContentLinksTable
          links={links.filter((link) => selected.recommendation_ids.includes(link.id))}
          onSelect={onReview}
        />
      </div>
    );
  if (!analysis.topics.length)
    return (
      <EmptyState
        icon={ICONS.site}
        heading="No clear topic groups yet"
        description="Pages stay ungrouped when the captured content does not support a useful topic."
      />
    );
  return (
    <div className="space-y-4">
      <p className="type-caption">
        Pages can belong to several topics. {analysis.unassigned_pages} pages are ungrouped.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Topic</TableHead>
            <TableHead numeric>Pages</TableHead>
            <TableHead numeric>Contextual links</TableHead>
            <TableHead numeric>Suggestions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {analysis.topics.map((topic) => (
            <TableRow key={topic.id}>
              <TableCell>
                <Button variant="ghost" onClick={() => onSelect(topic.id)}>
                  {topic.label}
                </Button>
              </TableCell>
              <TableCell numeric>{topic.page_ids.length}</TableCell>
              <TableCell numeric>{topic.contextual_links}</TableCell>
              <TableCell numeric>{topic.recommendation_ids.length}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
