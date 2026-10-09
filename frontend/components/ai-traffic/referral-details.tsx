import type { AiReferrals } from '@/lib/api/ai-traffic';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert } from '@/components/ui/alert';
import { formatPercent } from '@/lib/format';
import { TrafficUrlButton } from './url-panel';

export function ReferralComparison({ data }: Readonly<{ data: AiReferrals }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Property-wide channel comparison</CardTitle>
        <CardDescription>
          GA4 sessions, engagement rate and key events as configured in your property.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Channel</TableHead>
              <TableHead numeric>Sessions</TableHead>
              <TableHead numeric>Engagement rate</TableHead>
              <TableHead numeric>Key events</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.channel_comparison.map((r) => (
              <TableRow key={r.channel}>
                <TableCell>{r.channel}</TableCell>
                <TableCell numeric>{r.sessions ?? 'Unavailable'}</TableCell>
                <TableCell numeric>{formatPercent(r.engagement_rate, 1)}</TableCell>
                <TableCell numeric>{r.key_events ?? 'Unavailable'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
export function ReferralLandingPages({ data }: Readonly<{ data: AiReferrals }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI referral landing pages</CardTitle>
        <CardDescription>
          Host-scoped path identities · {data.reporting_timezone ?? 'Timezone unavailable'} ·{' '}
          {data.unattributed_landing ?? 'Unavailable'} unattributed landing sessions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!data.landing_pages.length ? (
          <Alert tone="info">
            No identifiable AI referrals to joinable landing paths were observed in the saved
            report.
          </Alert>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Landing path</TableHead>
              <TableHead>Source</TableHead>
              <TableHead numeric>Sessions</TableHead>
              <TableHead numeric>Key events</TableHead>
              <TableHead>Quality</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.landing_pages.map((r) => (
              <TableRow key={r.url_hash + r.ai_source}>
                <TableCell>
                  <TrafficUrlButton
                    urlHash={r.url_hash}
                    filters={{ start_date: data.window_start, end_date: data.window_end }}
                  >
                    {new URL(r.canonical_url).pathname}
                  </TrafficUrlButton>
                </TableCell>
                <TableCell>{r.ai_source}</TableCell>
                <TableCell numeric>{r.sessions ?? 'Unavailable'}</TableCell>
                <TableCell numeric>{r.key_events ?? 'Unavailable'}</TableCell>
                <TableCell>{r.analytics_quality.join(', ') || 'Unflagged'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
export function ReferralQuality({ data }: Readonly<{ data: AiReferrals }>) {
  const flags = [
    ...new Set(
      Object.values(data.analytics_quality).flatMap((days) => days.flatMap((d) => d.flags)),
    ),
  ];
  const excluded =
    data.analytics_quality.ga4_landing_daily?.reduce((sum, q) => sum + q.excluded_hosts, 0) ?? 0;
  return (
    <>
      <p className="type-caption">
        Property-wide source report · {data.reporting_timezone ?? 'Timezone unavailable'} ·{' '}
        {excluded} landing rows excluded for out-of-scope hosts.
      </p>
      {flags.length ? (
        <Alert tone="info">
          GA4 quality: {flags.join(', ')}. Missing or flagged observations are unavailable.
        </Alert>
      ) : null}
    </>
  );
}
