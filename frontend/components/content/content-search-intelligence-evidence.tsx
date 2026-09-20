import type { SearchIntelligenceHandoff } from '@/lib/api/search-intelligence';
import { Card, CardContent } from '@/components/ui/card';
import { textRole } from '@/components/ui/typography';

const HANDOFF_KEY = 'citeladder:search-intelligence-handoff';

export function takeSearchIntelligenceHandoff(projectId: string): SearchIntelligenceHandoff | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    const handoff = JSON.parse(raw) as SearchIntelligenceHandoff;
    if (
      handoff.project_id !== projectId ||
      !handoff.dataset_id ||
      !Array.isArray(handoff.row_ids) ||
      !Array.isArray(handoff.evidence)
    )
      return null;
    sessionStorage.removeItem(HANDOFF_KEY);
    return handoff;
  } catch {
    return null;
  }
}

export function SearchIntelligenceEvidence({
  handoff,
}: Readonly<{
  handoff: SearchIntelligenceHandoff;
}>) {
  return (
    <Card>
      <CardContent>
        <details open className="grid gap-3">
          <summary className={textRole('bodyStrong')}>
            {handoff.row_ids.length} Search Intelligence evidence rows attached · Read-only
          </summary>
          <ul className="grid gap-2">
            {handoff.evidence.map((row) => (
              <li key={String(row.id)} className={textRole('body')}>
                {String(row.keyword || row.domain || row.url || row.id)}
                {row.search_volume !== null && row.search_volume !== undefined
                  ? ` · Volume ${row.search_volume}`
                  : ''}
              </li>
            ))}
          </ul>
        </details>
      </CardContent>
    </Card>
  );
}
