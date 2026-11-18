---
title: 'Idempotency'
description: 'Retry a write safely with an Idempotency-Key header.'
group: 'API'
order: 353
updated: '2026-11-18'
---

Every `POST` that changes something needs an `Idempotency-Key` header, including creates, credit-spending runs and cancellations, such as a UUID you generate per operation.

If a network error leaves you unsure whether a request succeeded, send it again with the same key and body: you receive the original response, marked `Idempotent-Replayed: true`, and nothing happens twice.

- Reusing a key with a different body returns `409 idempotency_conflict`.
- If the original request failed with a server error, it may still have taken effect, so a retry with its key returns `409 idempotency_outcome_unknown` instead of running it again. Check the resource, then send a new key if it is still needed.
- Keys are remembered for 24 hours.
