'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { billingApi, createIdempotencyKey, type NoCardOffer } from '@/lib/api/billing';
import { queryKeys } from '@/lib/api/query-keys';

export function EarlyAccessDialog({
  offer,
  open,
  onOpenChange,
}: Readonly<{ offer: NoCardOffer; open: boolean; onOpenChange: (open: boolean) => void }>) {
  const queryClient = useQueryClient();
  const [operatorCode, setOperatorCode] = useState('');
  const [termsConsent, setTermsConsent] = useState(false);
  const [dataConsent, setDataConsent] = useState(false);
  const claim = useMutation({
    mutationFn: () =>
      billingApi.claimNoCardOffer(
        {
          campaign_id: offer.campaign_id,
          operator_code: operatorCode.trim() || undefined,
          terms_consent: termsConsent,
          data_sharing_consent: dataConsent,
        },
        createIdempotencyKey(),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.billing.all });
    },
  });
  const canClaim = offer.status === 'available' && termsConsent && dataConsent && !claim.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Claim your 7-day Tier 1 early access"
      description="A temporary promotional grant while payments are disabled. No card, no charge, and nothing renews."
      footer={
        <Button disabled={!canClaim || claim.isSuccess} onClick={() => claim.mutate()}>
          {claim.isPending
            ? 'Claiming…'
            : claim.isSuccess
              ? 'Early access claimed'
              : 'Claim 7-day early access'}
        </Button>
      }
    >
      <div className="grid gap-5">
        <Alert tone="info">
          Open to eligible new accounts. Eligibility is decided by the server; creating another
          workspace does not reset it.
        </Alert>
        <div className="grid gap-2 text-sm">
          <p className="font-medium">Tier 1 · {offer.duration_days} days</p>
          <p className="text-secondary">
            When access expires, the workspace returns to free access. Completed evidence is not
            deleted and no payment is scheduled.
          </p>
        </div>
        {offer.operator_code_allowed ? (
          <Field
            label="Operator exception code (optional)"
            hint="Validated server-side. It cannot bypass the one-introduction lifetime limit."
          >
            {(props) => (
              <Input
                {...props}
                value={operatorCode}
                onChange={(event) => setOperatorCode(event.target.value)}
                autoComplete="off"
              />
            )}
          </Field>
        ) : null}
        <div className="grid gap-3">
          <Checkbox
            checked={termsConsent}
            onCheckedChange={(checked) => setTermsConsent(checked === true)}
            label="I understand this temporary Tier 1 grant ends automatically with no card, charge, or renewal."
          />
          <Checkbox
            checked={dataConsent}
            onCheckedChange={(checked) => setDataConsent(checked === true)}
            label="I understand requests use the AI provider keys I connect and are subject to that provider’s terms."
          />
        </div>
        {claim.isError ? (
          <Alert tone="danger">
            {claim.error instanceof Error
              ? claim.error.message
              : 'Early access could not be claimed.'}
          </Alert>
        ) : null}
        {claim.isSuccess ? (
          <Alert tone="success">
            Early access ends{' '}
            {new Date(claim.data.expires_at).toLocaleDateString('en-US', {
              dateStyle: 'medium',
              timeZone: 'UTC',
            })}
            . Nothing renews and nothing will be charged.
          </Alert>
        ) : null}
      </div>
    </Dialog>
  );
}
