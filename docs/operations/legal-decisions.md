# CiteLadder legal decisions

The single record of CiteLadder's legal position: company details, what is
published, the decisions still open for the owner, and the decisions already
made. Open items are for the owner; resolved items are the reference for anyone
changing a legal page or a behaviour a page describes.

- **Page text** lives in `frontend/lib/marketing-content/legal*.ts` (Terms,
  Privacy, DPA, Subprocessors, Refund, Cancellation, Contact, Cookies, AI
  Policy). The code is the authority for wording; this document is the
  authority for the commitments behind it.
- **Change a commitment** (a right, period, provider, location or promise) only
  after it is resolved here, and update this document in the same pull request.
- **Revision dates** on the pages are revision dates, not legal effective dates.
- The full 24–26 September 2026 review draft (page drafts, the enterprise MSA
  and Order Form drafts, the Acceptable Use Policy draft, the country matrix and
  the vendor register) is in git history:
  `git show 5333b0765:docs/operations/CiteLadder_Legal_Pages_Final_Review_Draft_2026-09-24.md`.

## Company details

| Item | Value | Status |
|---|---|---|
| Contracting entity | Cube27 IT Private Limited, operating CiteLadder (a product, not a company) | Published |
| Company registration | CIN U72900PN2020PTC194984 | Published 2026-10-12 |
| Registered office | Plot No. 12, Mulberry Gardens 1, Magarpatta City, Hadapsar, Pune, Maharashtra 411013, India | Published as registered office 2026-10-12 |
| Contact and grievance email | contact@cube27.com (grievances marked "Grievance") | Published |
| Named grievance contact and designation | — | Open (L1) |
| Business telephone | — | Open (L1) |

Record: `PARENT_COMPANY` and `LEGAL_ENTITY` in
`frontend/lib/marketing-content/legal.ts`. An empty `LEGAL_ENTITY` field hides
its line on the pages.

## Published pages

| Route | Source |
|---|---|
| `/terms` | `legal-terms.ts` |
| `/privacy` | `legal-privacy.ts` |
| `/dpa`, `/subprocessors` | `legal-dpa.ts` |
| `/refund-policy`, `/cancellation-policy`, `/contact` | `legal-billing.ts` |
| `/cookies`, `/ai-policy` | `legal.ts` |

Terms acceptance is recorded per user and workspace against
`terms_revision` (`frontend/services/api/src/config/auth-runtime.json`,
`src/workspaces/policies.ts`). The footer has a persistent Cookie preferences
control. `/crawler` is not published (L9).

## Open decisions (owner)

| ID | Decision needed | Context and options |
|---|---|---|
| L1 | Named grievance contact (name, designation) and business telephone | Grievances go to the contact email until then. Fill `LEGAL_ENTITY` in `legal.ts`. |
| L2 | Legal effective date for the documents | Pages show only a revision date. |
| L3 | Counsel review of every published page | Includes the owner-published baselines awaiting counsel: no change-of-mind refund (R3), the 12-month fee liability cap and Pune courts (R4), and 18+ business use (R5). Decide whether confidentiality, data-protection duties or indemnities need a separate higher cap. |
| L4 | Markets served, and the transfer mechanism for US hosting | Hosting and most subprocessors are in the United States; the DPA says Cube27 will put a transfer mechanism in place where the law requires. Options: name SCCs (EU/UK addenda) once a customer needs them, or leave as is until an EU/UK customer signs. Country-by-country review (India DPDP, UK, EU, US states, Canada, Australia and others) is in the git-history country matrix. |
| L5 | AI credits, top-ups and plan-gated models in the Terms | Decide once paid plans are activated (today only the free trial is live). Proposed: "AI features use the AI credits included in your plan or bought as top-ups; the amounts, the models offered on each plan and their credit use are shown in the app and may change." |
| L6 | Payment-dispute (chargeback) handling commitment | Today an operator handles disputes in the Razorpay Dashboard; nothing is revoked or alerted (B51). The Refund Policy keeps chargeback rights and promises no process. |
| L7 | Tax and GST wording | GST rate, SAC, LUT and approval reference are owner inputs with the accountant; see [payment owner requirements](razorpay-and-demo-owner-requirements.md) and the billing decision log. No tax text changes until then. |
| L8 | Model-provider terms behind the no-training promise | Confirm, from each provider's business account settings and terms, that Anthropic, OpenAI and Google API calls are not used for training and what each retains. The pages promise no training by CiteLadder and do not promise zero retention. |
| L9 | Publish `/crawler` | The bot's user agent `CiteLadderSiteHealthBot/1.0 (+https://citeladder.com/crawler)` links to a page that does not exist. The draft copy (git history, Part D §8) must match the shipped robots policy (R17) before publishing. |
| L10 | Google API Limited Use statement on `/privacy` | Publish only after the downstream use of GSC and GA4 data (Agent, MCP, exports) is verified against Google's API Services User Data Policy. |
| L11 | Enterprise agreement package | Counsel review of the draft MSA, Order Form, Acceptable Use Policy and agreement precedence (git history, Part E); support hours and any SLA; cyber and technology E&O insurance quotes. Not needed for self-serve launch. |
| L12 | DataForSEO processing location | DataForSEO OÜ is registered in Estonia; its server location is not published. The subprocessor row says "Estonia (provider's registered office)" until DataForSEO confirms. |

## Open implementation items (engineering)

These keep published promises true; none needs an owner decision.

| ID | Item | Until done |
|---|---|---|
| I1 | Automate deletion after paid access ends (30-day export window, deletion within a further 30 days) and track verified deletion requests to their 30-day deadline | An operator deletes by hand on request or at the deadline. The trial purge 30 days after trial end is already automated (`BILLING_TRIAL_DATA_RETENTION_DAYS`). |
| I2 | Deliver subprocessor-change notices to workspace owners and record objections | Pre-launch there are no DPA customers to notify (R12). Needed before the first DPA customer. |
| I3 | Operator runbook: refund a renewal charged after a timely cancellation | Covers the case where every cancellation send to Razorpay failed (B46, R9). |

## Resolved decisions (reference)

| ID | Decision | Date and source |
|---|---|---|
| R1 | Pages are CiteLadder's own and bind Cube27 IT Private Limited; they replaced links to Cube27's corporate policies. | Owner, 2026-09-24 |
| R2 | No statement that "we do not save any user data" (untrue). Pages state what is not done: no sale, no model training, no cross-customer disclosure, no responsibility for copies held by external clients the customer authorised. | Owner, 2026-09-24 |
| R3 | No general change-of-mind refund after a paid subscription is activated. Refunds cover billing errors, unremedied non-delivery, discontinued services, add-ons or top-ups paid when no paid period was active, and refunds the law requires. | Owner, 2026-09-24 (D2); add-on case 2026-10-12 |
| R4 | Liability cap of fees paid or payable in the preceding 12 months; Indian law, courts in Pune, Maharashtra. Published as the baseline; counsel may change it (L3). | Owner, 2026-09-24 (D6) |
| R5 | Accounts are for business use by adults aged 18 or over; mandatory consumer rights are not waived. | Owner, 2026-09-24 (D9) |
| R6 | The customer is responsible for its instructions, data and use of outputs, including API and MCP clients; the indemnity covers misuse of outputs and API or MCP data. | Owner, 2026-09-24 |
| R7 | No mistaken-purchase refund window for add-ons or top-ups (D3 dropped). | Owner, 2026-10-12 |
| R8 | No fixed response-time targets for complaints or refunds; requests are handled within the period applicable law requires (D4 dropped). | Owner, 2026-10-12 |
| R9 | Cancellation takes effect at the end of the paid period with no fee. The promise that a renewal charged after a timely cancellation will be corrected stays; an operator refunds it manually. | Owner, 2026-10-12 (B46) |
| R10 | A full refund of the current period's payment cancels the subscription at once and revokes that period's grants; a partial refund changes nothing. | Owner, 2026-10-12 (B50, B52) |
| R11 | Retention: data kept while the workspace has access and until deleted. After all paid access ends, 30 days to request an export, then deletion within a further 30 days. A verified deletion request is completed within 30 days. Backup copies are removed within 90 days of active deletion. An unconverted trial workspace is deleted 30 days after the trial ends. Cancellation is not deletion. | Owner, 2026-10-12 (D5); trial purge from workspace-ownership decisions 2026-10-10 |
| R12 | Subprocessor changes: 30 days' notice and a 15-day objection window, with an urgent-change exception. Pre-launch, with no DPA customers to notify, a new subprocessor takes effect at once: TypeSafe AI (2026-09-28); Anthropic, Google (Gemini), DataForSEO and Resend (2026-10-12). | Owner, 2026-09-24 (D8), 2026-09-28, 2026-10-12 |
| R13 | Breach notification "without undue delay", and within any shorter period the law requires; no fixed hour deadline. | Owner, 2026-09-24, confirmed 2026-10-12 |
| R14 | Hosting is named: Google Cloud, United States (us-central1), with Cloudflare's global network in front. Cube27 operates from India. No residency promise beyond the subprocessor list. | Owner, 2026-10-12 |
| R15 | The Agent always uses platform providers (Anthropic or OpenAI); customers cannot supply an Agent model. Agent conversations, including the model's working notes used to continue a chat, are stored in the workspace until deleted and are not all shown to customers. | Owner, 2026-10-11 (B19), 2026-10-12 |
| R16 | Providers the customer connects under its own credentials (its own answer-engine keys, DataForSEO, Google and Bing accounts, sign-in, MCP and API clients) are not Cube27's subprocessors. When CiteLadder supplies the keys, the provider is a subprocessor. Razorpay is an independent payment provider. | Owner, 2026-09-24; DPA review 2026-10-12 |
| R17 | Site Health crawler: declared bot user agent; an unreachable robots.txt pauses the host; 401/403 robots is recorded as access-blocked and not bypassed; a Crawl-delay above the supported maximum pauses the host. | Owner robots policy (#156, #158) |
| R18 | Google Analytics loads only after cookie consent. Cloudflare Zaraz and Google Tag Gateway are off. | Owner, 2026-10-09 and 2026-10-12 |
| R19 | Company registration number and registered office are published. | Owner, 2026-10-12 |

## Subprocessors at a glance

Platform subprocessors (Cube27's accounts): Google Cloud (US), Cloudflare
(global), Anthropic (US), OpenAI (US), Google Gemini (US), DataForSEO (Estonia,
L12), Resend (US), Keenable (US), Tavily (US), TypeSafe AI (US). The table on
`/subprocessors` gives each provider's purpose and data.
