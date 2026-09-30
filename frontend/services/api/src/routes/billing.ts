import { z } from 'zod';
import {
  activationSchema,
  billingCatalogSchema,
  billingEntitlementSchema,
  billingUsageSchema,
  workspaceEntitlementSchema,
  noCardOfferSchema,
  noCardClaimSchema,
  introductoryEndSchema,
  cardTrialUnavailableSchema,
  subscriptionChangeSchema,
  subscriptionCheckoutSchema,
  planChangeSchema,
  resolvedQuoteSchema,
} from '@citeladder/contracts/billing';
import { definePostRoute, defineRoute } from './define.ts';
import { readBody } from '../http/body.ts';
import {
  publicCatalog,
  entitlementRead,
  usageRead,
  workspaceEntitlementRead,
} from '../billing/reads.ts';
import {
  baseRequest,
  packRequest,
  changeRequest,
  idempotencyKey,
  purchase,
  changePlan,
  workspaceActivation,
  activationResponse,
} from '../billing/purchases.ts';
import { identitySchema, conflict } from '../billing/contracts.ts';
import { offerRead, claimOffer, endOffer, claimRequest } from '../billing/journeys.ts';
import { cancelSubscription } from '../billing/cancellation.ts';
import { checkoutAvailable, configured, verifyCallback } from '../billing/razorpay.ts';
import { receiveWebhook } from '../billing/webhooks.ts';

const family = 'billing';
const root = '/api/v1/billing';
const params = { path: {}, query: {} } as const;
const privateRoute = { family, capability: 'manage_billing', params } as const;
const activationParams = {
  path: { activation_id: { scalar: { kind: 'uuid' }, required: true } },
  query: {},
} as const;
const keyHeaders = z.object({ 'idempotency-key': z.string().nullable().optional() });
const verifyRequest = z
  .object({
    fields: z
      .record(z.string().regex(/^[A-Za-z0-9_]{1,64}$/u), z.string().max(512))
      .refine((fields) => Object.keys(fields).length <= 8),
  })
  .strict();

export const billingRoutes = [
  defineRoute({
    family,
    path: `${root}/catalog`,
    authorize: 'public',
    params: {
      path: {},
      query: { country_code: { scalar: { kind: 'str', minLength: 2, maxLength: 2 } } },
    },
    response: billingCatalogSchema,
    handle: ({ db, config }, { query }) =>
      publicCatalog(db, config, query.country_code?.trim().toUpperCase() ?? null),
  }),
  defineRoute({
    family,
    path: '/api/v1/workspaces/{workspace_id}/entitlements',
    authorize: 'workspace-path',
    params: { path: { workspace_id: { scalar: { kind: 'uuid' }, required: true } }, query: {} },
    response: workspaceEntitlementSchema,
    handle: ({ c, db }) => workspaceEntitlementRead(db, c.get('workspace').workspaceId, new Date()),
  }),
  defineRoute({
    ...privateRoute,
    path: `${root}/entitlement`,
    response: billingEntitlementSchema,
    handle: ({ c, db }) => entitlementRead(db, c.get('workspace').workspaceId, new Date()),
  }),
  defineRoute({
    ...privateRoute,
    path: `${root}/usage`,
    response: billingUsageSchema,
    handle: ({ c, db }) => usageRead(db, c.get('workspace').workspaceId, new Date()),
  }),
  defineRoute({
    ...privateRoute,
    path: `${root}/early-access`,
    response: noCardOfferSchema,
    handle: ({ c, db }) => offerRead(db, c.get('workspace').workspaceId, new Date()),
  }),
  defineRoute({
    ...privateRoute,
    path: `${root}/early-access/claim`,
    method: 'post',
    headers: keyHeaders,
    body: claimRequest,
    response: noCardClaimSchema,
    async handle({ c, db }) {
      return claimOffer(
        db,
        c.get('workspace').workspaceId,
        c.get('user').id,
        await readBody(c, claimRequest),
        idempotencyKey(c.req.header('idempotency-key')),
      );
    },
  }),
  defineRoute({
    ...privateRoute,
    path: `${root}/early-access`,
    method: 'delete',
    headers: keyHeaders,
    response: introductoryEndSchema,
    handle: ({ c, db }) =>
      endOffer(
        db,
        c.get('workspace').workspaceId,
        c.get('user').id,
        idempotencyKey(c.req.header('idempotency-key')),
      ),
  }),
  defineRoute({
    ...privateRoute,
    path: `${root}/card-trial/quote`,
    response: cardTrialUnavailableSchema,
    async handle() {
      return { status: 'unavailable', reason: 'provider_evidence_required' } as const;
    },
  }),
  defineRoute({
    ...privateRoute,
    path: `${root}/subscriptions`,
    method: 'post',
    headers: keyHeaders,
    body: baseRequest,
    response: activationSchema,
    status: 202,
    alsoStatus: 200,
    raw: true,
    async handle({ c, db, config }) {
      const input = await readBody(c, baseRequest);
      if (input.trial_requested) conflict('trial_unavailable');
      const identity = identitySchema.parse({
        name: input.billing_name,
        address_line1: input.billing_address_line1,
        city: input.billing_city,
        postal_code: input.billing_postal_code,
        state_code: input.billing_state_code || null,
        customer_gstin: input.customer_gstin?.toUpperCase() || null,
        export_eligibility_attested: input.export_eligibility_attested,
      });
      const result = await purchase(
        db,
        config,
        c.get('workspace').workspaceId,
        {
          kind: 'base',
          key: input.catalog_key,
          quantity: 1,
          mode: input.credential_mode,
          country: input.country_code,
          identity,
        },
        idempotencyKey(c.req.header('idempotency-key')),
      );
      return c.json(result, result.status === 'pending' ? 202 : 200);
    },
  }),
  ...(['addons', 'topups'] as const).map((route) =>
    defineRoute({
      ...privateRoute,
      path: `${root}/${route}`,
      method: 'post',
      headers: keyHeaders,
      body: packRequest,
      response: activationSchema,
      status: 202,
      alsoStatus: 200,
      raw: true,
      async handle({ c, db, config }) {
        const input = await readBody(c, packRequest);
        const result = await purchase(
          db,
          config,
          c.get('workspace').workspaceId,
          {
            kind: route === 'addons' ? 'addon' : 'topup',
            key: input.catalog_key,
            quantity: input.quantity,
            mode: 'byok',
          },
          idempotencyKey(c.req.header('idempotency-key')),
        );
        return c.json(result, result.status === 'pending' ? 202 : 200);
      },
    }),
  ),
  defineRoute({
    ...privateRoute,
    path: `${root}/subscription`,
    method: 'delete',
    response: subscriptionChangeSchema,
    handle: ({ c, db, config }) => cancelSubscription(db, config, c.get('workspace').workspaceId),
  }),
  defineRoute({
    ...privateRoute,
    path: `${root}/subscription/change`,
    method: 'post',
    headers: keyHeaders,
    body: changeRequest,
    response: planChangeSchema,
    status: 202,
    alsoStatus: 200,
    raw: true,
    async handle({ c, db, config }) {
      const input = await readBody(c, changeRequest);
      const result = await changePlan(
        db,
        config,
        c.get('workspace').workspaceId,
        input.catalog_key,
        idempotencyKey(c.req.header('idempotency-key')),
      );
      return c.json(result, result.activation?.status === 'pending' ? 202 : 200);
    },
  }),
  defineRoute({
    ...privateRoute,
    path: `${root}/activations/{activation_id}`,
    params: activationParams,
    response: activationSchema,
    async handle({ c, db }, { path }) {
      return activationResponse(
        await workspaceActivation(db, c.get('workspace').workspaceId, path.activation_id),
      );
    },
  }),
  defineRoute({
    ...privateRoute,
    path: `${root}/activations/{activation_id}/checkout`,
    params: activationParams,
    response: subscriptionCheckoutSchema,
    async handle({ c, db, config }, { path }) {
      const pending = await workspaceActivation(
        db,
        c.get('workspace').workspaceId,
        path.activation_id,
      );
      if (
        pending.status !== 'pending' ||
        pending.expires_at <= new Date() ||
        !pending.external_reference ||
        pending.provider !== 'razorpay' ||
        pending.provider_mode !== config.razorpay.mode ||
        !checkoutAvailable(config.billing, config.razorpay, pending.region)
      )
        conflict('checkout_unavailable');
      return subscriptionCheckoutSchema.parse({
        activation_id: pending.id,
        provider: pending.provider,
        provider_mode: pending.provider_mode,
        flow: 'provider_sdk',
        redirect_url: '',
        sdk_name: 'razorpay',
        public_key: config.razorpay.keyId,
        reference: pending.external_reference,
        reference_kind: pending.activation_kind === 'base' ? 'subscription' : 'order',
        expires_at: pending.expires_at.toISOString(),
        quote: resolvedQuoteSchema.parse(pending.quote),
      });
    },
  }),
  defineRoute({
    ...privateRoute,
    path: `${root}/activations/{activation_id}/verify`,
    params: activationParams,
    method: 'post',
    body: verifyRequest,
    response: activationSchema,
    status: 202,
    async handle({ c, db, config }, { path }) {
      const input = await readBody(c, verifyRequest);
      const pending = await workspaceActivation(
        db,
        c.get('workspace').workspaceId,
        path.activation_id,
      );
      if (
        !pending.external_reference ||
        pending.provider !== 'razorpay' ||
        pending.provider_mode !== config.razorpay.mode ||
        !configured(config.razorpay)
      )
        conflict('checkout_unavailable');
      verifyCallback(config.razorpay, pending.external_reference, input.fields);
      await db
        .updateTable('pending_activations')
        .set({ reconciliation_next_at: new Date() })
        .where('id', '=', pending.id)
        .where('billing_account_id', '=', pending.billing_account_id)
        .where('status', '=', 'pending')
        .execute();
      return activationResponse(pending);
    },
  }),
  (() => {
    const route = definePostRoute({
      family,
      path: `${root}/webhooks/{provider}`,
      authorize: 'public',
      params: {
        path: { provider: { scalar: { kind: 'str', maxLength: 64 }, required: true } },
        query: {},
      },
      response: z.null(),
      raw: true,
      async handle({ c, db, config }, { path }) {
        await receiveWebhook(db, config, c, path.provider);
        return c.body(null, 204);
      },
    });
    return { ...route, contract: { ...route.contract, responses: { 204: null } } };
  })(),
];
