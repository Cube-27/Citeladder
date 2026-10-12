# Security audit 2026-10: decisions for the owner

Items from the [security audit](security-audit-2026-10.md) that need an owner
decision. None of them changes runtime behaviour until the owner decides. Each
entry gives the finding, the options and Engineering's recommendation. Once
the owner decides an item, it moves to the [backlog](backlog.md) or into a PR.

## Already decided (recorded for review)

- **Worker-signed HMAC origin (Owner, 2026-10-12).** The owner accepted any
  option that adds no cost. Shipped in PR 1 (#384). Alternatives, both rejected
  for cost or complexity:
  - Cloud Run ingress `internal-and-cloud-load-balancing`, which needs a paid
    load balancer.
  - Cloud Run IAM invoker with Worker-held service-account keys, which is a
    long-lived key in Cloudflare.

  The signature binds time, method, host, path, query and visitor address, but
  not the body, cookies or Authorization header. Within 60 seconds, a captured
  set of signed headers could carry a different body on the same method and
  path. That would need an attacker already inside the Worker→Cloud Run path,
  where they could read the request anyway. Optional later step: sign a body
  digest.
- **Recovery revokes MCP grants and own API keys (Owner).** Shipped in PR 1.
- **One trial per mailbox ([B49](../billing-decisions.md)).** Shipped in PR 1.

## Billing

1. **Refund cancels the subscription ([B50](../billing-decisions.md)).** Two
   details are open:
   - (a) Does only a full refund cancel, or also a partial one?
   - (b) Does access end at once, or at the end of the paid period?

   *Recommend:* a full refund of the current period's payment cancels the
   subscription at once and revokes that period's plan grants. Partial refunds
   change nothing.
2. **Disputes ([B51](../billing-decisions.md)), on the backlog.** Today a
   chargeback is neither revoked nor alerted on. *Recommend later:* on
   `payment.dispute.created`, alert an operator. Revoke only on
   `payment.dispute.lost`.
3. **Declared billing country selects pricing.** A buyer can declare a cheaper
   country. *Recommend:* accept this until checkout is live, then match the
   country against the card's or GST evidence.

## Authentication and sessions

4. **Sign-out does not yet revoke MCP grants or API keys. Confirm before
   implementing.** The owner's recovery answer covered password reset, password
   change *and* sign-out-everywhere. PR 1 implemented the first two. Sign-out
   was held back because CiteLadder has only one sign-out, and it is
   sign-out-everywhere. Applying the rule there would disconnect every MCP
   client and revoke every API key the person made, each time they sign out
   anywhere. *Options:*
   - (a) Apply it as answered.
   - (b) Add a separate "sign out everywhere and disconnect integrations"
     control, and leave plain sign-out alone.

   *Recommend:* (b).
5. **The change-password and link-Google flows do not spend the per-email
   login-failure budget.** *Recommend:* spend it (small change).
6. **The request body is parsed as JSON whatever its `Content-Type`.**
   *Recommend:* require `application/json` on JSON routes. This is
   defence-in-depth for CSRF; Sec-Fetch-Site already holds.
7. **The MCP confirmation token is visible to the model.** A prompt-injected
   model could prepare and confirm `launch_audit` on a grant that can write.
   This is documented, and the action is bounded by credits. *Recommend:* keep
   it, or require client-side elicitation when clients support it.

## Membership lifecycle

8. **An integration grant persists after the member who connected it leaves.**
   *Recommend:* keep the grant, because the workspace owns the data. Show who
   connected it and let an Admin reconnect.
9. **Crawl-log ingest tokens survive the removal of the member who created
   them.** *Recommend:* keep them. The tokens belong to the workspace's source,
   not to a person.
10. **Trial purge does not remove incomplete brand discoveries.** *Recommend:*
    include them in the trial purge.

## Availability

11. **No per-user cap on concurrent SSE streams (Site Health and audits).** Audit
    streams now end after 300 seconds. *Recommend:* cap open streams at 3 per
    user, held in process memory per instance, with no new infrastructure.
12. **GCP crawl-log setup verification.** Its distinct outcomes reveal which
    Pub/Sub subscriptions the shared reader can see. *Recommend:* collapse them
    into "not reachable" for anything other than the caller's own nonce-labelled
    subscription.

## Narrow races found in PR 1 review (Engineering, low)

- An API key created by a request that passed session checks just before a
  password reset can survive that reset. *Recommend:* in the creation
  transaction, lock the creator's user row and recheck `session_version`.
- Concurrent retries of the same idempotency key can each spend one unit of
  a crawl-log batch window or a judge window before one of them replays.
  *Recommend:* accept this. The cost is one unit per overlap.

## Infrastructure and supply chain

13. **Cloud Run ingress is `all`.** HMAC now protects it. *Recommend:* no change
    unless a load balancer arrives for another reason.
14. **The deploy service account is near-owner (`projectIamAdmin` and others).**
    *Recommend:* split it into a Terraform-apply role and a runtime-deploy role.
15. **The WIF `principalSet` covers the whole repository.** *Recommend:* bind it
    to `refs/heads/main` and the production environment.
16. **Postgres TLS uses a self-signed certificate without verification.**
    *Recommend:* pin the server CA in `DB_SSL_MODE=verify-ca`.
17. **pnpm `minimumReleaseAge` is 0.** *Recommend:* 1440 (one day).
18. **`APP_ENV` defaults to `development`.** *Recommend:* default to production,
    so an unset variable fails safe.
