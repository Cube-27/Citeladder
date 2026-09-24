# CiteLadder Legal Pages
## Final review draft and publication decisions

**Prepared:** 24 September 2026\
**Product:** CiteLadder\
**Proposed contracting entity:** Cube27 IT Private Limited\
**Status:** Drafts for business approval and final legal review. Not yet approved for publication.

---

# Part 0. Implementation status (24 September 2026)

The owner asked for a minimum set of CiteLadder policy pages to go live now, using only positions that need no further decision. The pages are CiteLadder's own and bind Cube27 IT Private Limited. They replace the footer and sign-in links to Cube27's corporate privacy and terms pages. The copy lives in `frontend/lib/marketing-content/legal*.ts`. Everything below remains open.

## 0.1 Published

| Route | Built from | Left out until decided |
|---|---|---|
| `/terms` | Part D §1 | Nothing withheld. Three clauses came from the draft's own proposals: the **12-month fee liability cap** and **Pune courts** (D6), and the **18+ business-use** statement (D9). The owner decided on 24 September 2026 to publish them as the liability baseline. Counsel review is still to come, and it may change them. Also dropped: the DPA precedence sentence and the open-source-licence sentence. |
| `/privacy` | Part D §2 | Every fixed retention window: 30-day export, 30-day deletion, 90-day backup (D5). Complaint targets of 48 hours and 30 days (D4). The Google API Limited Use statement (C4 says to publish it only once the controls are verified). The named grievance contact and phone number (D1). The page instead says requests are handled "within the period applicable law requires". |
| `/refund-policy` | Part D §5 | The 7-day refund for a mistaken add-on or top-up purchase (**D3**, not published). The 5-business-day decision and initiation targets (D4). **Published as proposed:** no change-of-mind refund after activation (**D2**). Confirm or change it. |
| `/cancellation-policy` | Part D §6 | The 30-day export and deletion schedule (D5). The page points to the Privacy Policy instead. |
| `/contact` | Part D §10 | Registration number, telephone and named grievance contact. Each renders automatically once its `LEGAL_ENTITY` field in `legal.ts` is filled. The 48-hour and 30-day targets are also left out (D4). |
| `/cookies`, `/ai-policy` | Existing pages | Now reference the local Privacy Policy and Terms and name Cube27 IT Private Limited. The cookie inventory is unchanged. |
| `/dpa` | Part D §3 | Built from the draft, with the owner's go-ahead on 24 September 2026. It includes the D8 positions: **30 days' notice** of a new subprocessor, a **15-day** objection window, and breach notice "without undue delay". Retention periods refer to the Privacy Policy, since D5 is still open. It adds a clause that the customer is solely responsible for the lawfulness of its instructions and data, and for use of the outputs. |
| `/subprocessors` | Code and production-config audit (24 September 2026) | Only services the product actually calls: Google Cloud (India, Mumbai region), Cloudflare, OpenAI (platform AI assistance), Keenable and Tavily (research). Customer-connected providers are listed separately: BYOK AI engines, DataForSEO, GSC, GA4, Bing, Google sign-in and MCP/API clients. Razorpay and Google Analytics are listed as independent providers. Keenable and Tavily are listed as processing in the **United States** (owner confirmation, 24 September 2026: both run on US cloud infrastructure). Tavily stays listed because commerce competitor discovery calls it first whenever `TAVILY_API_KEY` is set, and that key is a repository secret the deploy syncs to the VM. Remove the row only after removing the key from GitHub and Secret Manager, or removing the Tavily path from `backend/app/domain/commerce/competitors.py`. Logfire (not enabled), and Apple and GitHub sign-in (not configured) are left out. |

**Misuse and liability (owner request, 24 September 2026):**
- A new Terms section, "Your responsibility for use of the Service", states that:
  - the Service provides data and outputs, not professional advice;
  - the customer is solely responsible for how it, its users, its clients and any API or MCP client use the Service;
  - Cube27 is not liable for misuse, or for data once it is delivered to an external client;
  - third-party data is provided as received.
- The indemnity now covers misuse of outputs and of API or MCP data.
- Matching lines were added to the AI Policy, the Privacy Policy (external clients), the DPA and `/docs/mcp`.
- **Not published:** "we do not save any user data". It is untrue: workspaces store projects, crawl evidence, AI answers and invoices, and a false statement increases liability. The pages instead state what is actually not done: no sale, no model training, and no responsibility for copies held by external clients.

Not published: `/crawler` (see 0.2, item 6).

The pages show "Last updated 24 September 2026", which is the revision date. They show no "Effective date" until you approve one.

## 0.2 Pending points for the owner

1. **Decisions D1–D9** in Part A. Published pages use only settled positions. The D2 refund position, the D6 liability cap and Pune courts, and the D9 age and business-use statement are published by owner decision (24 September 2026) and await counsel review.
2. **Entity record (D1):** the company registration number, the grievance contact's name and designation, and a business telephone number. Also confirm whether the Pune address is the registered office. It is currently described only as the "principal business address".
3. **Effective date:** approve a legal effective date for the documents.
4. **Terms acceptance record (C2):** checkout now shows recurring or one-time payment consent and links the Terms, Refund Policy and Cancellation Policy. It does **not** yet store the accepted Terms revision, user, workspace, time and order. That needs a backend change.
5. **Cookie preferences control (C7):** there is no persistent "Cookie preferences" footer control. To change a choice, visitors clear site data, and the Cookie Policy says so.
6. **Crawler (C3), held by owner decision on 24 September 2026.** An audit found that the draft `/crawler` copy is untrue on three points:
   - **Identity:** every Site Health request uses `curl_cffi` browser impersonation (`curl_cffi_impersonation_profile = "chrome"`, `backend/app/core/config/site_health_runtime.py`). The transport drops any caller User-Agent (`curl_transport.py`, `_request_headers`). Sites therefore see Chrome, never `CiteLadderSiteHealthBot`. That name is only matched against robots.txt rules, and it is currently misconfigured as `(+https://citeladder)`.
   - **Unreachable robots.txt:** a network failure fetching robots.txt is treated as allow-all (`robots_cache.py`, `RobotsCache._fetch` returns no status). A 5xx response is correctly treated as a temporary full disallow.
   - **Crawl-delay:** a declared Crawl-delay is silently capped at `max_crawl_delay_seconds` (30 seconds) rather than honoured, or the host paused.

   **Agreed future fix (the recommended option), before `/crawler` is published:**
   - send `CiteLadderSiteHealthBot/1.0 (+https://citeladder.com/crawler)` as the real User-Agent;
   - pause crawling when robots.txt cannot be fetched;
   - skip a host whose Crawl-delay exceeds the supported maximum;
   - verify against RFC 9309, then publish the draft Part D §8 copy.

   Expect more blocks from bot-protected hosts, such as Akamai, once the browser profile is gone. The Terms and Privacy Policy do not describe the crawler's identity, so nothing published today contradicts the current behaviour.
7. **Google Limited Use (C4):** verify the controls, then add the statement to `/privacy`.
8. **Content-drafting model before deploy:** production content generation is set to `mimo-v2.5:free` through TokenHarbor (`CONTENT_PROVIDER_ENDPOINT=https://tokenharbor.ai/...`, environment `gcp-demo`). The owner will replace it before deploying. Free aggregator models may log prompts or train on them, which would breach the published no-training promise. `/subprocessors` lists OpenAI as the platform AI provider, so the replacement should be OpenAI. If it is another provider, add that provider's row to `SUBPROCESSORS` in `frontend/lib/marketing-content/legal-dpa.ts` first. Customers can already set their own content and Growth Agent models in Providers settings.
9. **Subprocessor operations:** the DPA now commits to 30 days' notice of a new subprocessor, through the page and an email to workspace owners. Keep this list in step with production configuration. Also confirm whether Cloudflare Zaraz injects Google Tag Manager or Analytics before consent. It is configured in the Cloudflare dashboard and cannot be seen in the repository. The Cookie Policy says Analytics loads only after acceptance.
10. **Final legal review** of every published page, including `/dpa` and `/subprocessors`. They were built from this draft and the code audit, not reviewed by counsel.

Parts A–C are internal and must not appear on the public website. Part D contains the proposed public page copy. All bracketed placeholders must be completed before publication. The proposed commitments in Part D are subject to the decisions and implementation requirements below.

---

# Part A. Decisions required from the business

The wording below uses the proposed position in this table. Approve or change each pending item before publishing the affected pages.

| ID | Decision or information required | Proposed position in the drafts | Affected pages |
|---|---|---|---|
| D1 | Confirm the exact contracting name, principal/registered address, company registration details and public contacts. Supply the grievance contact's name/designation and business telephone number. | Use **Cube27 IT Private Limited**, the Pune address below, and **contact@cube27.com**. CiteLadder is the product, not a separate company. Do not describe the address as the registered office until confirmed. | All pages; footer; contact; invoices |
| D2 | Approve the paid-subscription refund policy. | No general change-of-mind money-back guarantee after activation. Refund billing errors, unremedied non-delivery, qualifying service failures, provider-initiated discontinuation and amounts required by law. Mandatory rights remain unaffected. | Terms; Refund; checkout |
| D3 | Decide whether unused add-ons and top-ups receive a mistake-purchase refund. | Allow a request within **7 calendar days**, only if no associated credits or additional capacity have been used. Remove this concession if not approved; retain billing-error and legally required refunds. | Refund; checkout; support process |
| D4 | Approve operational response targets. | Acknowledge complaints within **48 hours**; aim to resolve within **30 calendar days**. For a refund request with complete information, communicate a decision within **5 business days** and initiate an approved refund within a further **5 business days**, or sooner where required. | Privacy; Refund; Contact |
| D5 | Approve data retention, export and deletion windows, including treatment of unpaid/free workspaces. | While an active plan includes data retention, keep project history as needed. Once all service access ends, provide **30 calendar days** to request export, then delete/de-identify active-system project data within a further **30 calendar days**. A verified earlier deletion request starts its own **30-day** deletion deadline. Remove residual backup copies within **90 calendar days after active-system deletion**. Cancellation is not immediate deletion. Approve a separate inactivity rule for any continuing free workspace. | Privacy; DPA; Cancellation |
| D6 | Approve liability allocation and dispute terms with counsel. | Cube27's ordinary contractual liability cap is the affected Service's fees paid/payable in the preceding **12 months**. The draft excludes fraud, wilful misconduct and liabilities that cannot legally be limited. Decide whether confidentiality, data-protection obligations or indemnities need a separate higher cap. Indian law; competent courts in **Pune, Maharashtra**, subject to mandatory rights. | Terms; DPA; enterprise agreements |
| D7 | Approve the data-use commitments and active provider list. | No sale of private Customer Data; no training or fine-tuning of general-purpose models on it; no cross-customer disclosure of private project information. Customer-specific AI assistance is permitted as disclosed. Approve each production provider, purpose, data category and processing location. Do not promise universal zero retention or India-only processing. | Privacy; AI; DPA; Subprocessors |
| D8 | Approve enterprise subprocessor and incident-response commitments. | **30 calendar days'** prior notice for a new/replacement subprocessor, **15 calendar days** for a reasoned objection, with a documented urgent-change exception. Notify affected customers of personal-data breaches without undue delay and within any shorter applicable deadline. No separate fixed contractual hourly SLA unless approved and operationally supported. | DPA; Subprocessors; enterprise agreements |
| D9 | Confirm the markets being served and obtain legal sign-off for those markets. | Business/professional customers aged **18+**. Do not treat the business-use label as a waiver of applicable consumer rights. Complete any necessary overseas privacy/transfer arrangements before the affected processing starts. Obtain final Indian legal review of the documents and any applicable overseas addenda. | Terms; Privacy; DPA |

**Company information used in the drafts:**

Cube27 IT Private Limited, operating CiteLadder\
Plot No. 12, Mulberry Gardens 1, Magarpatta City, Hadapsar, Pune, Maharashtra 411013, India\
Email: contact@cube27.com\
Company registration number: **[COMPANY_REGISTRATION_NUMBER]**\
Grievance contact: **[GRIEVANCE_CONTACT_NAME_AND_DESIGNATION]**\
Business telephone: **[BUSINESS_CONTACT_PHONE]**

**Dates:** Replace **[EFFECTIVE_DATE]** with the approved publication/effective date. Do not automatically use the preparation date as the legal effective date.

---

# Part B. Assumptions and existing commercial settings

These are the settings carried into the drafts, rather than new pending commercial decisions. An implementation mismatch must be resolved before the relevant promise is published.

| Area | Setting used in the drafts |
|---|---|
| Operator and scope | Cube27 operates CiteLadder. The documents cover the marketing website, hosted application, API, MCP and related support. They do not alter a separate open-source licence. |
| Initial paid launch | Monthly subscriptions. Answer-engine tracking launches in BYOK mode. Platform-funded visibility plans are not described as generally available. Platform-provided assistance may still exist in eligible features. |
| Trial | Where granted, a 7-day, invitation-based trial; no payment card and no automatic charge at expiry. Limits are those shown when access is granted. |
| Cancellation | Period-end cancellation. Verified paid access continues to the end of the paid period, with no separate cancellation fee. |
| Plan changes | An upgrade can take effect after the disclosed prorated charge is paid. A downgrade takes effect at the next renewal without a mid-period refund. Publish these paths only when operational. |
| Add-ons and top-ups | One-time purchases, not recurring add-on subscriptions. Their original expiry is 30 days after purchase. Use also requires eligible active paid access. A lapse stops use; renewal before original expiry can restore use without extending that expiry. |
| Refund effect | A full refund revokes the refunded purchase's remaining grants. A partial refund does not automatically remove access. Previously consumed credits are not reinstated or clawed back. Refunds produce the appropriate credit note. |
| Payment processor and tax | Razorpay processes supported checkout payments. Cube27 remains the seller. Tax is shown in the approved quote; foreign billing details alone do not establish export eligibility. |
| Site Health | Customer-authorised public-site analysis with bounded acquisition. No customer-facing authenticated crawl or robots-bypass feature is promised. |
| Data and evidence | Extracted crawl evidence, answer-engine responses, connected-source imports and provenance may be retained for project history. No promise that only derived metrics are stored. |
| Accounts and deletion | Support-assisted verified deletion is the minimum proposed process. Self-service deletion is not described as available. |
| Security and AI | No certification, dedicated residency, unrestricted zero-retention, guaranteed search outcome or autonomous publishing claim is made. |

---

# Part C. Implementation guidance

## C1. Public routes and publication dependencies

| Route | Document | Must be resolved before publishing |
|---|---|---|
| `/terms` | Terms of Service | D1–D3, D6, D9; checkout and service wording aligned |
| `/privacy` | Privacy Policy | D1, D4–D5, D7, D9; retention, requests and actual data flows verified |
| `/dpa` | Data Processing Agreement | D5–D9; processing schedule, security controls, subprocessor and transfer arrangements completed |
| `/cookies` | Cookie Policy | Cookie inventory and preference/revocation controls verified |
| `/refund-policy` | Refund Policy | D2–D4; refund, entitlement and credit-note operations working |
| `/cancellation-policy` | Cancellation Policy | Working period-end cancellation and clear effective-date confirmation |
| `/ai-policy` | AI & Automated Systems Policy | D7; provider routes, data use and external-client access verified |
| `/crawler` | Site Health Crawler Policy | Actual user agent, robots handling and contact workflow match the copy |
| `/subprocessors` | Subprocessors and Service Providers | D7–D8; only active, correctly classified providers retained |
| `/contact` | Contact and Grievance Information | D1 and D4; monitored contact channels and assigned complaint owner |

## C2. Legal content and acceptance

Use one shared legal-content model and entity/contact record. Serve the pages as readable, indexable HTML on the marketing domain. Keep navigation, effective date, document version and document-specific canonical URL consistent.

Update website and application footers, sign-up, billing, checkout, OAuth consent-screen URLs, AI-policy links and customer emails to point to the CiteLadder pages. Keep the existing `/cookies` and `/ai-policy` routes. Do not change the corporate website's own policies.

Record the accepted Terms revision, accepting user, workspace, timestamp and relevant order at sign-up/checkout. Present Privacy as a notice; do not treat accepting Terms as blanket consent to every processing purpose. Obtain separate choices for optional analytics, marketing and any data use that needs separate consent.

Signed enterprise agreements retain their agreed precedence. Notify existing customers of the change to product-specific documents; do not retrospectively rewrite completed purchases, invoices or negotiated terms.

## C3. Crawler requirements

Set the actual outgoing User-Agent and the robots-matching identity consistently:

```text
CiteLadderSiteHealthBot/1.0 (+https://citeladder.com/crawler)
```

Confirm the transport does not replace the bot identification with a browser-only header. Apply the same safety policy to discovery, analysis, sitemap acquisition and redirect handling where relevant.

Before publishing the proposed Crawler Policy, verify: valid rules are honoured; network failures and server errors retrieving robots temporarily stop crawling; a missing/empty robots file is distinguished from an unreachable one; parseable rules survive malformed lines; and declared delays are not silently shortened. If a requested delay is unsupported, pause or skip that host rather than claiming to honour a delay that is capped below it. Use [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html) as the robots-handling acceptance specification.

Keep private-network protection, redirect revalidation, time/size/rate limits and sensitive-route exclusions. Provide a monitored bot-contact and opt-out investigation process. Crawl cancellation must stop new work while preserving completed evidence according to retention policy.

## C4. Data inventory, AI and credentials

Maintain a field-level processing inventory for accounts, projects, web evidence, prompts/responses, content drafts, integrations, MCP, billing, support, logs and backups. Record purpose, recipient, retention and deletion method.

Verify storage controls for every AI call path, including default-agent, content-generation and answer-engine adapters. Do not infer zero retention from a `store=false` setting. Approve providers and account settings before transmitting confidential/personal data. Do not use free/training-enabled provider modes where they conflict with the approved no-training commitment.

Store and handle BYOK/OAuth credentials securely; do not place them in prompts, normal logs, customer exports or browser responses. Implement connection revocation and credential deletion separately from imported-history deletion. Check monitoring payloads for prompts, personal data and secrets before enabling telemetry.

Google integration disclosures must match actual access, storage, AI sharing and deletion. Publish the Limited Use statement only with matching controls. Apply the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) to covered data and its derivatives; do not assume aggregation removes its restrictions.

MCP/API access must remain permission-scoped. Tell administrators that authorising an external client allows that client to receive returned data. Revoking a token stops future access but does not delete copies already held by that client.

## C5. Retention, deletion and export

Implement the exact D5 schedule, including what starts each clock. Cover free workspaces, expired trials, cancelled subscriptions, projects, integration imports, model artifacts, support copies, caches, analytics and backups.

For a verified deletion request, stop new collection/execution and revoke relevant credentials before deleting data. Retain only the records required for defined legal, tax, accounting, fraud, security or dispute purposes. Set category-specific retention periods with counsel and the accountant; do not label ordinary project content a tax record.

Provide a support-assisted export of supported customer data. Confirm what formats and datasets are available; do not promise a complete export of provider-licensed material or Cube27 source code. Backups must not reintroduce deleted records when restored: reapply deletion records before returning a restored system to service.

Immutable evidence means protected against routine editing, not exempt from an authorised deletion obligation.

## C6. Billing, refunds and cancellation

Keep plan, quote, tax, expiry, refund summary and policy version consistent across Pricing, checkout, billing, invoices and support. Use the approved backend catalog rather than duplicated prices in legal prose.

Test period-end cancellation, repeated cancellation, payment failures, concurrent changes, upgrade proration, next-cycle downgrades, add-on expiry and lapse/renewal behavior. A timely verified cancellation request must not create another renewal because the in-app control or support handling failed.

Test duplicate/incorrect payments, failed provisioning, full/partial refunds, grant revocation, refund failures, provider reconciliation and credit-note creation. An approved manual refund process is acceptable; an unimplemented automated refund button is not required or promised.

[Normal Razorpay refunds](https://razorpay.com/docs/payments/refunds/normal/) currently use a **7–10 business-day** general bank-credit estimate after initiation, with variation by payment method. Keep that estimate separate from Cube27's approval and initiation targets. Return funds to the original payment method and provide the refund reference; do not guarantee a bank completion date.

Define “unused” through purchase-linked credit/capacity records before offering D3. Unspent consumable credits and already-used extra project/prompt capacity are not the same thing.

## C7. Cookies and preference controls

Add a persistent **Cookie preferences** control in the footer and on `/cookies`. Allow changing a choice without clearing all site data. Test marketing and application origins separately; local storage is origin-specific.

Do not load optional analytics before consent. Verify that rejection or withdrawal stops optional measurement and clears applicable first-party analytics identifiers where feasible. Do not assume a consent-mode update alone stops all network signals.

Complete a browser/network inventory of session, OAuth, preferences, analytics, payment and security storage. Add only observed cookies/storage to the public inventory and verify their lifetimes. Version consent records and re-request consent when a material optional purpose changes.

## C8. Operational approval

Assign an owner for privacy/grievance requests, crawler complaints, security incidents and refunds. Establish identity checks, escalation, statutory-deadline handling and records of resolution. Prepare the subprocessor-change notice/objection process before publishing the DPA commitment.

Complete applicable data-transfer arrangements and the DPA security schedule. Security controls in the public text must be operational; unsupported certification or residency claims must not be added.

Before publishing, obtain the business decisions in Part A and final legal approval. Run a content check for unresolved placeholders, inconsistent periods, broken routes, stale corporate-policy links and unimplemented promises. This document does not authorise repository changes or deployment.

## C9. Provider-list completion

Before publishing `/subprocessors`, replace the template rows with the approved active providers. Do not publish the placeholders or list every supported integration as an active subprocessor.

| Candidate service to verify | Intended category/purpose to confirm |
|---|---|
| Google Cloud | Hosting, database/storage, backup and infrastructure; confirm the contracting entity and actual regions |
| Cloudflare | Delivery, proxying and security; confirm which request content and personal data pass through it |
| OpenAI, Anthropic and Google AI | Check each route separately: platform-managed assistance versus customer BYOK, relevant account terms and retention settings |
| DataForSEO | Search intelligence and search-surface datasets; confirm the request data sent and contractual role |
| Keenable and Tavily | Include only if production research/discovery calls are enabled and relevant data is received |
| Pydantic Logfire or another monitoring provider | Include only if enabled; verify redaction, identifiers, payload capture and region |
| Razorpay | Payment processing; verify the relevant legal entity and independent/processor role for each purpose |
| Google Analytics | Include only if the production analytics tag is enabled; keep separate from customers' connected analytics properties |
| Google Search Console, Google Analytics APIs and Bing | Customer-directed data connections; confirm actual permissions and role rather than automatically listing as subprocessors |
| Any email, support or other production supplier | Add only after confirming actual use, data categories, contract and processing locations |

Each published row needs a verified provider identity, purpose, data scope, processing location and role. The approved list must match the DPA, Privacy Policy and live configuration.

---

# Part D. Public page drafts

Only the text beneath each document heading is proposed for the website. Resolve Part A and Part C before publishing it.

# 1. Terms of Service

**Effective date: [EFFECTIVE_DATE]**

## 1. Operator and agreement

CiteLadder is operated by Cube27 IT Private Limited, with its principal business address at Plot No. 12, Mulberry Gardens 1, Magarpatta City, Hadapsar, Pune, Maharashtra 411013, India ("Cube27", "CiteLadder", "we", "us" or "our").

These Terms govern the CiteLadder website, hosted application, APIs, MCP interfaces, reports and related services (the "Service"). By accepting these Terms or placing an order that incorporates them, you enter into an agreement with Cube27. A person accepting for an organisation represents that they are authorised to bind it; "Customer" and "you" then mean that organisation.

The Service is intended for business and professional use by people aged 18 or over who can enter into a binding agreement. Nothing in these Terms excludes a mandatory consumer or other statutory right.

A signed enterprise agreement or order takes precedence where it expressly differs. The Data Processing Agreement controls conflicts concerning personal data processed on your behalf, subject to any mandatory transfer terms. Our Refund and Cancellation Policies form part of these Terms. The Privacy Policy explains our handling of personal data.

## 2. Accounts and permitted access

Provide accurate account and billing information, protect credentials and notify us promptly of suspected unauthorised access. You are responsible for your authorised users and their use within the permissions and limits of your plan.

Agencies and consultants may use purchased workspaces for clients where the plan permits and the client has authorised the relevant access and processing. This does not permit unrestricted resale or sharing of one customer's private data with another.

## 3. Service and limitations

Features may include Site Health crawling, search and AI-visibility measurement, citations, search intelligence, connected analytics, content assistance, reports, APIs and MCP. Availability, provider support, execution limits, history and features depend on your plan and configuration.

Discovery totals, analysed pages and completed provider responses are different measures. Results apply to the pages, sources, dates, markets and configurations actually observed. An incomplete crawl is not a whole-site assessment.

We do not guarantee search rankings, AI mentions or citations, indexing, traffic, revenue or conversions. AI outputs and third-party datasets may be inaccurate, incomplete, unavailable or different from another user's experience. Site Health is not a security certification, penetration test or guarantee of legal or accessibility compliance.

## 4. Customer Data and ownership

"Customer Data" means information you supply or authorise us to collect or process for your workspace, including configuration, prompts, connected-source data, web evidence and project outputs. Calling information Customer Data does not transfer third-party intellectual-property rights to you.

As between you and Cube27, you retain your rights in Customer Data. You grant us a limited, non-exclusive licence to host, transmit, analyse, transform and display it to provide, secure and support the Service, perform your instructions and meet legal obligations. Our Privacy Policy and DPA govern personal-data processing.

You may use and edit generated project outputs, subject to applicable law and third-party rights. We do not guarantee that AI outputs are unique or capable of copyright protection. Cube27 retains ownership of its platform, software, documentation, methods and branding. A separate open-source licence continues to govern code released under that licence.

You are responsible for having the rights, lawful basis, permissions and notices required for your submitted data, client projects, connected accounts and requested crawling.

## 5. Website crawling

Starting a crawl, or enabling a supported schedule, authorises automated requests within the selected scope. Submit a website for Site Health only if you own, control, manage or otherwise have permission to analyse it.

The crawler retrieves public website information and applies scope, robots, rate, network and response-size controls described in the Crawler Policy. It is not an authenticated crawler for private accounts, administration, checkout or payment areas, and does not offer permission to bypass access controls.

Raw page bodies may be processed transiently. Extracted facts, technical signals, links and provenance may be retained to support reports and historical comparison. A cancelled crawl may retain evidence already collected under the Privacy Policy.

Public accessibility or a permissive robots file is not, by itself, a grant of ownership, a copyright licence or permission to disregard another person's rights.

## 6. Integrations, AI providers and BYOK

Connecting an account authorises access to the selected data and properties within the permissions you grant. You must be entitled to grant that access.

A bring-your-own-key (BYOK) credential authorises the provider calls you initiate or schedule through CiteLadder. Provider fees under your account are separate from CiteLadder fees unless the purchase expressly states otherwise. Provider terms, account settings and limits also apply.

Relevant prompts and project context may be sent to the provider used for an enabled AI feature. We handle private Customer Data as described in the Privacy and AI Policies. We do not sell it or use it to train or fine-tune general-purpose AI models.

Disconnecting an integration stops future authorised access through that connection, but does not automatically erase previously imported evidence. Request deletion separately. Third-party services may change or become unavailable outside our control.

## 7. MCP, API access and external actions

Administrators must approve external clients and protect API/MCP tokens. An authorised client can receive data within its permissions and may retain copies under its own terms. Revocation stops future access; it cannot recall copies already received by that client.

AI suggestions and generated drafts require human review. Generation alone does not authorise publishing, billing changes or another consequential external action. Such actions require the specific permissions or confirmation offered by the applicable feature.

## 8. Acceptable use

Do not use the Service unlawfully; infringe privacy, confidentiality or intellectual-property rights; submit malware or stolen credentials; bypass access or usage restrictions; carry out unauthorised scraping or security testing; overload systems; or access another workspace without permission.

Do not intentionally submit payment-card secrets, government identifiers, sensitive health information or other highly sensitive personal data unless an expressly supported arrangement permits it. Do not reverse engineer proprietary Service components except where applicable law or a separate licence permits it.

We may restrict activity reasonably necessary to address abuse, security risks, legal requirements or overdue undisputed fees.

## 9. Fees, renewal and taxes

The checkout or signed order states the price, currency, billing period, allowances, renewal terms and applicable taxes. A recurring subscription renews as disclosed until cancelled. We will not purchase top-ups or initiate another paid order without the authorisation required for that purchase.

BYOK provider charges are payable separately to your provider. Indian prices may be exclusive of GST where clearly stated, with the total shown before payment. Tax treatment depends on the transaction and applicable requirements, not solely on a foreign billing address.

Razorpay or another disclosed provider processes payments. Cube27 is the supplier of the Service. Failed, reversed or disputed payments may affect paid access; we will provide notice where appropriate.

A future pricing or renewal change will be communicated before it takes effect, with an opportunity to cancel and any renewed payment authorisation required. Completed purchases and issued invoices are not retrospectively repriced.

## 10. Trials, upgrades and additional purchases

Where granted, the invitation-based trial lasts 7 days, requires no payment card and does not automatically convert into a paid subscription. Its features and execution limits are displayed when granted.

An upgrade takes effect after confirmation and payment of the disclosed prorated charge. A downgrade takes effect at the next renewal without a mid-period refund.

Add-ons and top-ups are one-time purchases with a 30-day expiry from successful payment, unless the checkout or signed order expressly states another period. Use requires an eligible active paid subscription. A lapse stops use; renewing before the original expiry can restore remaining eligible use but does not extend expiry. These purchases neither renew automatically nor extend the base subscription.

## 11. Cancellation and refunds

Cancel before the next renewal through Billing or, if that control is unavailable, by a verified request to contact@cube27.com. Cancellation takes effect at the end of the verified paid period, with no separate cancellation fee. It does not automatically produce a prorated refund.

Refund eligibility, processing and entitlement effects are set out in the Refund Policy. Statutory rights are unaffected.

## 12. Confidentiality and security

Each party will protect the other's non-public confidential information, use it only for the agreement and disclose it only to authorised recipients with appropriate obligations, or as law requires. This does not cover information independently developed, lawfully obtained without restriction or publicly available without breach.

We maintain reasonable technical and organisational safeguards. No online service can guarantee absolute security. Customer Personal Data processed on your behalf is also covered by the DPA.

## 13. Telemetry and feedback

We may use operational telemetry and genuinely de-identified, aggregated information for security, reliability and product operations. This does not permit disclosure of confidential project information, re-identification, model training prohibited by our policies, or uses restricted by connected-provider terms.

You allow us to use voluntarily provided product feedback without payment, but not to publish your name, logo or confidential information as a testimonial without permission.

## 14. Changes, suspension and termination

We may improve or change the Service and will give reasonable advance notice of a material reduction to purchased functionality where practicable. If we discontinue a paid Service without your breach and cannot provide a reasonably acceptable alternative, we will refund the unused prepaid portion attributable to it.

Either party may terminate for a material breach not remedied within 30 days after written notice. We may suspend or terminate sooner for unlawful activity, serious security risks or a breach that cannot reasonably be remedied. Notice and scope will be proportionate where legally and operationally possible.

Ending a subscription does not immediately delete Customer Data. Retention, export and deletion follow the Privacy Policy and DPA. Payment obligations already accrued and provisions intended to survive remain effective.

## 15. Warranties and liability

We will provide the Service with reasonable care and skill. Except for express commitments and rights that cannot lawfully be excluded, the Service is provided on an "as available" basis without a guarantee of uninterrupted availability or error-free third-party outputs.

To the extent permitted by law, neither party is liable for indirect or consequential loss, or loss of profits, revenue or goodwill arising from this agreement.

Cube27's aggregate contractual liability relating to the Service will not exceed the fees paid or payable for the affected Service during the 12 months preceding the event giving rise to the claim. This does not limit liability for fraud, wilful misconduct or any liability that applicable law does not permit to be limited. A signed enterprise agreement may specify a different cap or exclusions.

## 16. Third-party claims

To the extent permitted by law, you will defend and indemnify Cube27 against third-party claims arising from your unlawful Customer Data, unauthorised crawling or connected-account access, or material violation of another person's rights, except to the extent caused by Cube27's breach or misconduct.

Cube27 must promptly notify you of a claim, provide reasonable cooperation and allow you to control the defence. You may not settle in a way that admits fault by Cube27 or imposes a non-monetary obligation on it without its written consent, not to be unreasonably withheld.

## 17. Governing law and other terms

Indian law governs these Terms. Subject to mandatory rights and a signed agreement providing otherwise, courts of competent jurisdiction in Pune, Maharashtra have jurisdiction over disputes.

Material adverse changes to these Terms will be notified before taking effect where practicable, and any consent required by law will be obtained. Continued use does not substitute for legally required fresh consent. Changes do not retrospectively remove accrued rights.

If a provision is unenforceable, the remaining provisions continue. A delay in exercising a right is not a waiver. Neither party may assign the agreement in a manner that unlawfully reduces the other's rights. These Terms and applicable incorporated documents form the agreement for the relevant Service, subject to signed enterprise terms.

## 18. Contact

Cube27 IT Private Limited, operating CiteLadder\
Plot No. 12, Mulberry Gardens 1, Magarpatta City, Hadapsar, Pune, Maharashtra 411013, India\
Email: contact@cube27.com

---

# 2. Privacy Policy

**Effective date: [EFFECTIVE_DATE]**

## 1. Who we are

Cube27 IT Private Limited operates CiteLadder. Our principal business address is Plot No. 12, Mulberry Gardens 1, Magarpatta City, Hadapsar, Pune, Maharashtra 411013, India. Contact us at contact@cube27.com.

This Policy covers the website, hosted application, account administration, purchases, support and data processed through CiteLadder features. For our own account, billing, security and support purposes, we decide why and how personal data is processed, acting as a controller or Data Fiduciary where those terms apply. For personal data processed on a customer's instructions, we act as a processor or service provider under the DPA. Our role depends on the processing purpose, not merely the data's source.

## 2. Information we process

| Category | Examples | Main purposes |
|---|---|---|
| Account and workspace | Name, work email, authentication identifiers, organisation, roles, invitations and settings | Sign-in, administration, permissions and communications |
| Billing and tax | Billing address/country, tax identifiers, plan, transaction references, invoices, payment/refund status and limited payment metadata | Payments, entitlements, accounting, tax and disputes |
| Project configuration | Domains, brand and competitor information, prompts, markets, languages and selected providers | Configure analysis and monitoring |
| Website evidence | URLs, publicly accessible page content, technical metadata, structured facts, authors/contact information where present, links, crawl results and provenance | Site Health, evidence, reports and comparison |
| AI and content | Prompts, relevant project context, conversations/instructions, generated responses/drafts, citations and execution metadata | Requested AI assistance and visibility measurement |
| Connected sources | Selected properties, encrypted credentials, search/analytics queries, imported response payloads, metrics and sync history | Authorised integrations and analysis |
| Search intelligence | Domain, keyword, competitor and backlink query inputs and returned datasets | Requested research and search analysis |
| Usage and security | IP address, timestamps, device/browser information, requests, errors and operational events | Security, abuse prevention, reliability and troubleshooting |
| Support and feedback | Messages and relevant attachments or diagnostic details you provide | Assistance, complaint handling and follow-up |
| Cookies and local storage | Session, OAuth transaction, preferences, consent and optional analytics identifiers | Essential operation, selected settings and consented measurement |

CiteLadder does not intentionally store complete payment-card numbers, card security codes or payment-authentication secrets. The payment provider handles those details.

Public pages and search results may contain personal information. Public availability does not remove our responsibility to handle that information lawfully.

## 3. Sources and purposes

We receive information from you and your workspace users, connected accounts, customer-authorised website requests, selected AI/research/data providers, payment providers and use of the Service.

We use it to deliver requested features, preserve project evidence, manage accounts and billing, respond to support requests, protect the Service, improve operational reliability and meet applicable legal obligations. We use only the data reasonably needed for the relevant purpose.

Where consent is required, we obtain it for the identified purpose. Other processing takes place on a lawful ground available under the applicable law. In jurisdictions recognising contract, legal obligation or legitimate interests as grounds, these may apply to service delivery, accounting, security and business administration, subject to applicable safeguards. Optional consent is not made a condition of unrelated essential features.

## 4. Website and project evidence

A requested crawl processes page bodies to extract relevant information. Ordinary Site Health processing is not intended to create a permanent complete raw-HTML archive. Extracted content, findings, links and technical provenance can remain in the workspace for history and comparison.

AI responses and connected-provider imports may be retained as evidence, including response payloads where necessary. Evidence can contain personal or confidential information even when it is not stored as raw website HTML.

## 5. AI providers and data use

An enabled AI feature may transmit your prompt and relevant project context to the provider used for that feature. Authorising the feature or an allowed schedule instructs us to perform those disclosed calls. BYOK calls also use your own provider account and settings.

We do not sell private Customer Data, use it to train or fine-tune general-purpose AI models, or authorise our contracted AI providers to do so. We do not disclose one customer's private project information to another customer. Customer-specific analysis and generation are not a licence to reuse your private data for other customers.

Provider retention and processing depend on the applicable service, agreement and configuration. We apply supported controls for our approved routes, but do not promise that every provider deletes all data immediately. Security, abuse-monitoring or legal retention may still apply. Your BYOK agreement also applies without removing our own obligations for data we process.

## 6. Connected Google and other accounts

We access only the permissions and properties you authorise for the relevant integration. Depending on what you connect, this may include search queries, pages, impressions, clicks, analytics events, traffic and associated reporting data. We may retain imported data and derived reports to provide the requested features.

CiteLadder's use and transfer of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including its Limited Use requirements where applicable. Covered data is not used for advertising, sold or disclosed for unrelated purposes. Human access is limited to authorised support or other permitted purposes. Relevant data is sent to an AI provider only for a disclosed, authorised feature and where applicable provider requirements permit it.

You may disconnect an integration or revoke permissions through the provider. This stops future access through that authorisation; it does not automatically erase imported history. You can request deletion of that history separately.

## 7. Recipients and external clients

We disclose data as needed to approved infrastructure, AI, research, monitoring and support providers; to payment processors; and to connected platforms under your instructions. The Subprocessors and Service Providers page describes relevant recipients and purposes.

Workspace administrators and authorised members may access information according to their roles. If you authorise an API or MCP client, the client receives the data returned within its permissions. Its provider may retain that information independently. Revoke its access to stop future requests; contact that provider about copies it already holds.

We may also disclose information to advisers or authorities where necessary and lawful, or as part of a business transfer subject to required safeguards and consent. A corporate transaction does not override applicable connected-provider restrictions.

## 8. Retention, export and deletion

We retain project data while an active plan includes its retention and it remains necessary for the stated service purposes. If all service access ends and no continuing plan or signed agreement provides retention, we provide a **30-calendar-day window** to request an export of supported Customer Data. After that window, we delete or irreversibly de-identify project data in active systems within a further **30 calendar days**.

You may request deletion sooner. Following reasonable verification of identity and authority, we complete active-system deletion within **30 calendar days** of a valid request, or sooner where required. That request does not have to wait for the export window to end.

Residual copies in protected backups are removed through normal rotation within **90 calendar days after active-system deletion**. They are not used for ordinary business purposes. If a backup is restored for recovery, applicable deletion instructions are reapplied.

Billing cancellation alone is not a request for immediate deletion. A plan that continues to provide workspace/data access follows its disclosed retention and inactivity rules. We will notify you before a scheduled inactivity closure where appropriate.

We may retain limited billing, tax, accounting, consent, security, fraud or dispute records for the applicable required period. Retention exceptions do not justify keeping unrelated project content indefinitely. Data subject to a specific legal hold is restricted and deleted when the hold and other retention requirements end.

Third-party providers and authorised external clients may retain their own copies under their terms and legal obligations. We apply the deletion assistance and instructions required of our processors.

## 9. Security and international processing

We use technical and organisational safeguards appropriate to the data and risks, including controlled workspace access, protected credentials, encrypted transport, bounded website acquisition and operational security measures. No online service provides absolute security.

We operate from India. Approved providers may process information in other countries as described on the provider page or applicable agreement. Where required, we establish an appropriate international-transfer mechanism and safeguards before the transfer. We do not promise exclusive storage in India or another location unless a signed agreement does so.

## 10. Your choices and requests

Depending on the applicable law, you may request access, information, correction, erasure or a copy of your personal data; withdraw consent; object to or restrict certain processing; nominate a person where that right applies; or raise a complaint with the relevant authority.

Email contact@cube27.com. We may ask for proportionate verification. We will respond within applicable deadlines. Withdrawing consent does not invalidate earlier lawful processing but may prevent a feature that needs the data from continuing. Necessary legal records may still be retained.

For data controlled by your organisation, direct the request to its workspace administrator or privacy contact. We will assist that organisation as required by the DPA and law. Account removal and workspace deletion are distinct; removing one member does not necessarily delete the organisation's lawful records.

Use Cookie preferences to change optional analytics choices. Service/security communications remain separate from optional marketing, which may be declined or unsubscribed from.

## 11. Children

CiteLadder accounts are for adults aged 18 or over. The Service is not directed to children. Customers must not intentionally submit children's personal information unless a supported use has been lawfully authorised. Contact us if you believe a child's data has been collected inappropriately.

## 12. Updates and grievance contact

We will update this Policy when practices change, give notice of material changes where required and obtain fresh consent where applicable before using information for a new purpose.

Grievance contact: **[GRIEVANCE_CONTACT_NAME_AND_DESIGNATION]**\
Email: contact@cube27.com\
Telephone: **[BUSINESS_CONTACT_PHONE]**\
Address: Cube27 IT Private Limited, Plot No. 12, Mulberry Gardens 1, Magarpatta City, Hadapsar, Pune, Maharashtra 411013, India.

We acknowledge complaints within 48 hours and aim to resolve them within 30 calendar days, without extending any shorter deadline imposed by applicable law. You retain the right to approach the relevant authority or forum.

---

# 3. Data Processing Agreement

**Effective date: [EFFECTIVE_DATE]**

## 1. Scope and roles

This DPA forms part of the agreement between Cube27 IT Private Limited ("Cube27") and the Customer where Cube27 processes personal data on the Customer's behalf through CiteLadder ("Customer Personal Data").

The Customer is the controller/Data Fiduciary, or a processor authorised by its controller. Cube27 acts as processor or subprocessor accordingly. Personal data processed for Cube27's independent account, billing or security purposes is addressed in the Privacy Policy.

## 2. Instructions and responsibilities

Cube27 processes Customer Personal Data only to provide and secure the agreed Service, on documented instructions given through authorised configuration, use or written agreement, or where law requires. Cube27 will inform the Customer of a legally required processing obligation unless prohibited, and notify the Customer if an instruction appears unlawful.

The Customer is responsible for a lawful basis, appropriate notices and permissions, and the accuracy and necessity of the data it instructs Cube27 to process. Both parties retain their own applicable legal obligations.

## 3. Processing schedule

| Item | Description |
|---|---|
| Subject matter | Provision of CiteLadder website, search, visibility, content, integration, API and MCP features |
| Duration | Service term plus the applicable export, deletion and legally required retention periods |
| Frequency | As initiated or scheduled by authorised users, and as necessary for Service operation |
| Operations | Collection, receipt, organisation, storage, extraction, analysis, transmission, display, support, return and deletion |
| Purpose | Customer-requested analysis, measurement, content assistance, reporting and secure operation |
| Data subjects | Customer users and personnel; authorised client users; individuals whose information appears in customer-supplied material, public-site evidence or connected datasets |
| Data categories | Business identifiers and contact details; project content and prompts; page, query and reporting content; integration identifiers/credentials; usage/support information; returned evidence and outputs |
| Sensitive data | Not intended for specially sensitive or children's data unless separately approved with appropriate safeguards |

## 4. Confidentiality and security

Cube27 restricts access to authorised personnel with confidentiality obligations and maintains measures appropriate to processing risks. These include authentication and workspace/project permissions, protected integration credentials, encrypted transport, managed access to infrastructure, security-conscious logging, bounded network acquisition and recovery procedures.

Cube27 will maintain a completed description of the measures applicable to the deployed Service and provide it on reasonable request. The measures will not be materially reduced during the service term without an appropriate equivalent safeguard. No certification is implied by this DPA.

## 5. Subprocessors

The Customer gives general written authorisation for the approved subprocessors listed on the Subprocessors and Service Providers page to perform their identified activities. Cube27 will impose data-protection obligations providing the protection required by applicable law and remains responsible for its subprocessors' performance of those obligations.

Cube27 will give affected customers at least **30 calendar days'** prior notice of a new or replacement subprocessor. The Customer may object on reasonable data-protection grounds within **15 calendar days** of notice. The parties will work in good faith on an alternative or mitigation.

If the objection cannot be resolved before the proposed change, Cube27 will not require the Customer to accept the affected processing. Either party may terminate the affected part of the Service, and Cube27 will refund its unused prepaid fees. An urgent change necessary for security or service continuity may occur sooner, with notice without undue delay and the same opportunity to object.

Customer-directed providers are classified according to their actual role and agreement. A BYOK label alone does not remove Cube27's processor obligations.

## 6. Rights requests and assistance

Cube27 will promptly forward relevant individual requests to the Customer and provide reasonable assistance with applicable access, correction, deletion, portability or other rights, taking account of the processing and information available. It will not act contrary to the Customer's lawful instructions unless law requires.

Cube27 will also provide reasonable assistance with applicable security obligations, privacy impact assessments and regulatory consultation. Any exceptional support fees must be agreed in advance and cannot obstruct a mandatory obligation.

## 7. Personal-data breaches

Cube27 will notify the Customer without undue delay after becoming aware of a personal-data breach affecting Customer Personal Data, and within any shorter applicable legal or agreed deadline. Initial notice will not be withheld solely because an investigation is incomplete.

Information will be supplied as available, including the nature of the breach, affected data or people where known, likely consequences, contact point and mitigation. Cube27 will take reasonable containment and remediation measures and cooperate with the Customer. The Customer retains responsibility for its own notifications unless law provides otherwise.

## 8. International transfers

Cube27 will make restricted international transfers only under an applicable lawful mechanism, with the necessary contractual safeguards, completed schedules and assessments. Where required, this includes the appropriate European Standard Contractual Clauses and UK transfer arrangements.

A general reference to a transfer mechanism does not replace the completed arrangement. Mandatory transfer terms take precedence where they conflict with this DPA. Information about the applicable safeguards is available on request.

## 9. Return and deletion

At the Customer's choice, Cube27 will return supported Customer Personal Data or delete it at the end of the relevant Service, subject to the Privacy Policy's export and deletion schedule. A verified earlier deletion instruction is processed without waiting for the post-service export window.

After the export window, active-system project data is deleted/de-identified within 30 calendar days; a valid earlier request has its own 30-day deadline. Residual backup copies are removed within 90 calendar days after active-system deletion. Legally required retained records remain protected and restricted to their retention purpose.

Cube27 will instruct relevant subprocessors consistently and provide reasonable confirmation of completion on request. Persistent evidence is not exempt from authorised deletion merely because it is designed to be immutable in normal operation.

## 10. Information and audits

Cube27 will provide information reasonably necessary to demonstrate compliance and permit audits required by applicable law. Reviews should use available documentation first, without preventing a necessary inspection.

Reasonable notice, confidentiality, security and scope arrangements apply, but must not defeat mandatory audit rights. The parties may agree reasonable costs in advance. Routine audits should avoid unnecessary disruption or exposure of another customer's confidential information.

## 11. Precedence and contact

This DPA prevails over conflicting Terms concerning Customer Personal Data, subject to mandatory transfer provisions and expressly controlling signed enterprise terms. Contractual liability follows the agreement only to the extent permitted by applicable law; it does not limit an individual's or regulator's statutory rights.

Contact: contact@cube27.com.

---

# 4. Cookie Policy

**Effective date: [EFFECTIVE_DATE]**

## 1. Scope

Cube27 IT Private Limited uses cookies and similar browser storage to operate CiteLadder. This Policy should be read with the Privacy Policy.

## 2. Categories and current storage

Necessary storage supports sign-in, authorisation security and your consent choice. Preference storage remembers product settings. Optional analytics is used only after the applicable choice has been obtained.

| Name or type | Purpose | Category | Duration |
|---|---|---|---|
| `citeladder_session` | Maintains the authenticated session | Necessary cookie | Up to 24 hours by default, subject to the configured session lifetime |
| `citeladder_auth_oauth` and `citeladder_integration_oauth` | Protect short-lived sign-in or integration authorisation | Necessary cookies | Up to 10 minutes; cleared on completion or expiry |
| `citeladder.cookie-consent` | Remembers acceptance or rejection | Necessary local storage | Until replaced or browser/site data is cleared |
| Product preference storage | Remembers settings such as selected workspace and display preferences | Preference storage | Until changed or browser/site data is cleared |
| `_ga` and `_ga_<measurement-id>` | Website audience and session measurement | Optional analytics cookies | Up to 2 years by default; actual configuration or browser limits may shorten this |

Google Analytics is used only when configured and after analytics consent. We do not intentionally load it before that choice. Required sign-in and security functions remain available when optional analytics is rejected.

## 3. Change your choice

Use **Cookie preferences** in the footer to review or change optional analytics consent. Withdrawing consent stops subsequent optional analytics collection through our consent-controlled implementation. You can also delete or block storage through your browser. Blocking necessary storage may prevent sign-in or core features from working.

Choices may need to be made separately on another browser, device or CiteLadder origin. Clearing local storage may cause the consent prompt to appear again.

## 4. Third-party services and updates

An external payment, sign-in or connected-provider page may use its own storage under its policy. Any third-party storage loaded within CiteLadder is subject to the relevant disclosed purpose and consent requirements.

We update this Policy when the inventory or purposes change. Material new optional purposes will receive the required notice and choice.

Contact: contact@cube27.com.

---

# 5. Refund Policy

**Effective date: [EFFECTIVE_DATE]**

## 1. Scope

This Policy applies to subscriptions, add-ons and top-ups purchased directly from Cube27 IT Private Limited for CiteLadder. A signed enterprise agreement controls where it expressly provides different terms. Nothing here limits a refund or other remedy required by applicable law.

## 2. Trial and ordinary subscription cancellation

Where granted, the 7-day trial requires no payment card and does not automatically charge at expiry.

Once a paid subscription is activated and made available, there is no general change-of-mind refund or money-back guarantee. Ordinary cancellation prevents the next renewal and leaves access available through the current verified paid period. It does not automatically refund the unused part of that period.

## 3. Refund eligibility

We will correct duplicate charges and charges above the confirmed purchase amount caused by our billing error. If payment succeeds but the purchased access is not delivered and we cannot remedy it within a reasonable time, we will refund the undelivered purchase.

We will also provide refunds required by law and the unused prepaid amount attributable to a paid Service we discontinue without your breach if we cannot offer a reasonably acceptable alternative. Other material failures to deliver the agreed Service will be reviewed against the purchase terms and applicable law.

A change in AI answers, rankings, citations, traffic or another outcome we do not guarantee is not, by itself, a refund basis. This does not excuse failure to provide functionality we expressly sold.

## 4. Mistaken add-on or top-up purchases

You may request a refund for an add-on or top-up bought by mistake within **7 calendar days** of purchase if no associated credits or additional capacity have been used.

A purchase is not unused if its credits have funded an execution, or its additional project, prompt or URL capacity has been put into use. Other refund rights for billing error, non-delivery or applicable law are unaffected.

Unused entitlement expiring under the purchase terms, or becoming unavailable because the base subscription has ended, does not by itself create a refund right.

## 5. Requesting a refund

Email contact@cube27.com from the account email, stating your workspace, invoice/order/payment reference, purchase date, amount and reason. Do not send full card numbers, security codes, passwords or one-time payment codes.

We may ask for information reasonably needed to verify the purchase. With complete information, we aim to communicate the decision within **5 business days**. We will explain a rejection or any necessary investigation and will not extend a mandatory legal deadline.

## 6. Processing and payment method

We normally initiate an approved refund within **5 business days after approval**, or sooner where required. A refund is ordinarily sent to the original payment method.

After initiation, the payment provider and bank control the time for funds to appear. For [normal Razorpay refunds](https://razorpay.com/docs/payments/refunds/normal/), allow approximately **7–10 business days**, with variation by payment method and bank. This is an estimate, not a guaranteed bank completion date. We will provide the available refund reference and assist if the credit is delayed.

We do not deduct our payment-processing costs from refunds correcting our duplicate/incorrect charges or from a refund that law requires in full. Bank currency-conversion differences or independently imposed bank fees may be outside our control, subject to applicable rights.

## 7. Effect on access and tax records

A full refund revokes the remaining grants associated with the refunded purchase when the refund is issued. Previously consumed credits are not restored or clawed back. A partial refund does not automatically cancel the subscription or remove remaining access.

Where a full refund ends a subscription purchase, we will confirm the resulting access and renewal status; refunding an add-on alone does not cancel the base subscription. The applicable credit note will be issued.

Please contact us about a disputed charge so we can investigate. This does not require you to waive a chargeback or other right available under law or payment-network rules.

**Business days** mean Monday to Friday, excluding public holidays at our operating office in Maharashtra, India. Bank/provider calendars may differ.

Contact: contact@cube27.com.

---

# 6. Cancellation Policy

**Effective date: [EFFECTIVE_DATE]**

## 1. How to cancel

An authorised billing owner may cancel a recurring CiteLadder subscription at any time before the next renewal through the Billing area. If the control is unavailable or you cannot access the account, send a request from the account email to contact@cube27.com. We may verify your authority before acting.

There is no separate cancellation fee. We will confirm the effective date. A timely verified request will not be treated as late solely because our cancellation control or support processing failed.

## 2. Effective date and access

Cancellation stops future renewal and takes effect at the end of the current verified paid period. You keep that period's paid access, subject to the plan's usage limits and Terms. It does not create another period of paid access or reset used credits.

A renewal that already occurred before cancellation remains subject to the Refund Policy and applicable law. An erroneous renewal after a timely effective cancellation will be corrected.

## 3. Plan changes and additional purchases

An approved downgrade takes effect at the next renewal without a refund for the current period. An upgrade takes effect after confirmation and payment of the displayed prorated charge.

Add-ons and top-ups are one-time purchases. Their use requires eligible active paid access and stops when that access ends. Renewing before the purchase's original 30-day expiry can restore remaining eligible use, but does not extend expiry. Add-ons and top-ups do not extend the base subscription or renew automatically.

## 4. Refunds

Cancellation and refund are separate. Ordinary cancellation does not generate a prorated refund. Review the Refund Policy for billing errors, non-delivery, unused mistake purchases and legally required refunds.

## 5. Project data and deletion

Cancelling renewal does not immediately delete your workspace or project history. If no continuing plan includes data access when service ends, the Privacy Policy's 30-day export window and subsequent deletion schedule apply. A signed agreement may provide different periods.

You may separately request earlier deletion by emailing contact@cube27.com. Before deletion, request any supported export you need. Deletion may permanently remove history and evidence, subject to the limited backup and legal-retention provisions in the Privacy Policy.

Removing a workspace member, disconnecting an integration and cancelling a subscription are different actions. None should be assumed to perform the other actions automatically.

## 6. Enterprise orders and contact

A signed enterprise order may set a fixed term, notice period or other cancellation terms. Those terms control where expressly different, subject to mandatory rights.

Contact: contact@cube27.com.

---

# 7. AI & Automated Systems Policy

**Effective date: [EFFECTIVE_DATE]**

## 1. How AI is used

CiteLadder uses supported AI services for answer-engine measurement and, where enabled, research assistance, classification, explanations, briefs and drafts. Depending on the feature, the provider receives the prompt, instructions and relevant project context.

A visibility result records what a provider returned for a particular execution. It does not establish that the response is true, permanent or identical to what another user sees.

## 2. Measurements and generated material

Metrics described as deterministic are calculated from stored evidence using defined rules. Generated explanations and recommendations remain model-assisted outputs, not independent evidence that an outcome occurred.

Unavailable or incomplete evidence is distinguished from observed zero. Findings apply to the scope and information actually collected. A generated draft does not become a verified business fact merely because it was produced by AI.

## 3. Private data and providers

We do not sell private Customer Data or use it to train or fine-tune general-purpose models. We do not authorise our contracted providers to do so or disclose a customer's private project context to another customer.

Provider processing and retention depend on the relevant service and contract. Supported controls are applied to approved routes; we do not promise universal zero retention. BYOK also involves your provider account, settings, charges and terms.

External AI clients connected through MCP or an API receive data within the permissions you grant. Those clients may retain their own copies. Approve clients carefully and revoke access when it is no longer needed.

## 4. Human review and actions

Review generated recommendations, drafts, structured data and other material before relying on or publishing them. Verify factual, legal, commercial and other consequential claims. You remain responsible for your publishing and business decisions.

Generation alone does not authorise publishing, spending or changes to external systems. Consequential actions require the explicit permissions or confirmation offered by the relevant feature. User-authorised schedules operate within their disclosed scope and limits.

## 5. No outcome guarantee

CiteLadder does not guarantee a search ranking, citation, AI recommendation, traffic increase or commercial result. Provider models, data, APIs and availability can change independently of CiteLadder.

Contact: contact@cube27.com. Personal-data questions are also covered by the Privacy Policy and DPA.

---

# 8. Site Health Crawler Policy

**Effective date: [EFFECTIVE_DATE]**

## 1. Identity and purpose

CiteLadder's Site Health crawler identifies itself as:

```text
CiteLadderSiteHealthBot/1.0 (+https://citeladder.com/crawler)
```

It inspects websites at the direction of authorised customers to evaluate technical, content-structure and search/AI-readiness signals. It is not an unrestricted public web index or a vulnerability scanner.

## 2. Scope and safeguards

Customers may request Site Health only for websites they own, manage or are otherwise authorised to analyse. Requests are constrained by the selected scope and network-safety rules, including rate limits, timeouts, response-size bounds and redirect checks.

Crawl admission is designed to avoid private account, sign-in, administration, checkout, payment and similar routes. These safeguards do not replace a website owner's own access controls. Site Health does not offer authenticated crawling or a customer override of robots restrictions.

## 3. Robots and crawl pacing

We evaluate `robots.txt` rules for the `CiteLadderSiteHealthBot` identity and honour applicable valid restrictions. A missing or empty robots file may allow crawling, subject to other controls. Server or network failures retrieving robots cause a temporary pause rather than being treated as permission to crawl.

Malformed lines do not cancel otherwise parseable restrictions. Where a crawl delay is declared, we honour it or pause/skip the host if the requested delay cannot be supported. We may also slow or stop requests in response to rate limits, failures or an operator request.

A permissive robots file does not grant a copyright licence, consent for personal-data processing or permission to bypass protected content.

## 4. Blocking the bot

To request that this bot not crawl your website, place an appropriate rule in the site's robots file, for example:

```text
User-agent: CiteLadderSiteHealthBot
Disallow: /
```

Rules are applied when the robots policy is next fetched or refreshed. For an urgent issue, contact us with the affected hostname and relevant timestamps.

## 5. Evidence and contact

Page bodies may be processed transiently. Extracted content, technical findings, links, capture metadata and other bounded evidence may be retained for customer reports and historical comparison under the Privacy Policy. Cancellation stops new crawl work but does not automatically delete completed evidence.

To report a crawling problem or request review, email contact@cube27.com with your hostname, relevant URLs, approximate time and evidence of your authority where appropriate. Do not include credentials or other secrets.

---

# 9. Subprocessors and Service Providers

**Effective date: [EFFECTIVE_DATE]**

Cube27 IT Private Limited uses the providers below for the listed CiteLadder purposes. The recipient depends on the features and connections you use. Data is shared only as needed for the relevant purpose and applicable permissions.

## 1. Service subprocessors

The approved list of entities processing Customer Personal Data on our behalf is:

| Provider / contracting entity | Purpose | Data potentially processed | Processing countries or regions |
|---|---|---|---|
| [APPROVED_PROVIDER_LEGAL_NAME] | [APPROVED_SERVICE_PURPOSE] | [RELEVANT_DATA_CATEGORIES] | [VERIFIED_PROCESSING_LOCATIONS] |

## 2. Other service providers and customer-directed connections

Payment processing, optional website analytics and customer-directed integrations may involve providers acting under a separate role or their own account agreement. A provider is not automatically a subprocessor merely because CiteLadder integrates with it.

| Provider / service | Purpose | Data potentially processed | Role and processing locations |
|---|---|---|---|
| [APPROVED_PROVIDER_OR_CONNECTED_SERVICE] | [APPROVED_PURPOSE] | [RELEVANT_DATA_CATEGORIES] | [VERIFIED_ROLE_AND_LOCATIONS] |

Where you supply a BYOK credential or authorise an external MCP/API client, the relevant provider's terms and settings also apply. The Privacy Policy explains the distinction between stopping future access and deleting information already received.

## 3. Changes and contact

For customers covered by the DPA, we give advance notice and an opportunity to raise a reasoned data-protection objection to subprocessor changes as described there. Notices are sent to the registered workspace or contract contact. Keep that contact up to date.

Questions about providers, processing locations or safeguards: contact@cube27.com.

---

# 10. Contact and Grievance Information

**Effective date: [EFFECTIVE_DATE]**

**CiteLadder is a product of Cube27 IT Private Limited.**

Principal business address: Plot No. 12, Mulberry Gardens 1, Magarpatta City, Hadapsar, Pune, Maharashtra 411013, India.\
Company registration number: **[COMPANY_REGISTRATION_NUMBER]**\
Business telephone: **[BUSINESS_CONTACT_PHONE]**

For support, billing, cancellation, refunds, privacy requests or crawler concerns, email **contact@cube27.com**. Include the workspace/account and a relevant transaction or request reference, where applicable. Do not send passwords, API keys, full payment-card numbers or one-time payment codes.

**Grievance contact:** [GRIEVANCE_CONTACT_NAME_AND_DESIGNATION]\
**Email:** contact@cube27.com\
**Telephone:** [BUSINESS_CONTACT_PHONE]

We acknowledge complaints within **48 hours** and aim to resolve them within **30 calendar days**, or within a shorter period where applicable law requires it. If further information or investigation is needed, we will explain the next steps. This process does not remove your right to approach a competent authority or forum.
