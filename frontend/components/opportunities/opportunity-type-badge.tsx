import { Tag } from '@/components/ui/tag';
import type { OpportunityType } from '@citeladder/contracts';

const TYPE_LABEL: Record<OpportunityType, string> = {
  visibility: 'Visibility',
  commerce: 'Commerce',
  site: 'Site',
  traffic: 'Traffic',
  topic: 'Topic',
};

export function OpportunityTypeBadge({ type }: Readonly<{ type: OpportunityType }>) {
  return <Tag>{TYPE_LABEL[type]}</Tag>;
}
