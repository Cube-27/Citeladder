import { PARENT_COMPANY, OPERATOR_LINE, type LegalDocument } from './legal';
import { legalSections } from './legal-text';

/**
 * CiteLadder Terms of Service. Wording follows the 24 September 2026 review
 * draft; clauses that still wait on an owner decision are left out rather
 * than published as a guess.
 */
export const TERMS_OF_SERVICE: LegalDocument = {
  slug: 'terms',
  title: 'Terms of Service',
  description: 'The agreement that governs your use of CiteLadder, operated by Cube27.',
  sections: legalSections(`
## operator | Operator and agreement
CiteLadder is operated by ${PARENT_COMPANY.legalName}, with its principal business address at ${PARENT_COMPANY.address} (“Cube27”, “CiteLadder”, “we”, “us” or “our”).
These Terms govern the CiteLadder website, hosted application, APIs, MCP interfaces, reports and related services (the “Service”). By accepting these Terms or placing an order that incorporates them, you enter into an agreement with Cube27. A person accepting for an organisation represents that they are authorised to bind it; “Customer” and “you” then mean that organisation.
The Service is intended for business and professional use by people aged 18 or over who can enter into a binding agreement. Nothing in these Terms excludes a mandatory consumer or other statutory right.
A signed enterprise agreement or order takes precedence where it expressly differs. Our Refund Policy at /refund-policy, Cancellation Policy at /cancellation-policy and, where we process personal data on your behalf, our Data Processing Agreement at /dpa form part of these Terms. Our Privacy Policy at /privacy explains how we handle personal data.

## accounts | Accounts and permitted access
Provide accurate account and billing information, protect credentials and notify us promptly of suspected unauthorised access. You are responsible for your authorised users and their use within the permissions and limits of your plan.
Agencies and consultants may use purchased workspaces for clients where the plan permits and the client has authorised the relevant access and processing. This does not permit unrestricted resale, or sharing one customer’s private data with another.

## service | Service and limitations
Features may include Site Health crawling, search and AI-visibility measurement, citations, search intelligence, connected analytics, content assistance, reports, APIs and MCP. Availability, provider support, execution limits, history and features depend on your plan and configuration.
Discovery totals, analysed pages and completed provider responses are different measures. Results apply to the pages, sources, dates, markets and configurations actually observed. An incomplete crawl is not a whole-site assessment.
We do not guarantee search rankings, AI mentions or citations, indexing, traffic, revenue or conversions. AI outputs and third-party datasets may be inaccurate, incomplete, unavailable or different from another user’s experience. Site Health is not a security certification, penetration test or guarantee of legal or accessibility compliance.

## customer-data | Customer Data and ownership
“Customer Data” means information you supply or authorise us to collect or process for your workspace, including configuration, prompts, connected-source data, web evidence and project outputs. Calling information Customer Data does not transfer third-party intellectual-property rights to you.
As between you and Cube27, you retain your rights in Customer Data. You grant us a limited, non-exclusive licence to host, transmit, analyse, transform and display it to provide, secure and support the Service, perform your instructions and meet legal obligations. Our Privacy Policy governs how we process personal data.
You may use and edit generated project outputs, subject to applicable law and third-party rights. We do not guarantee that AI outputs are unique or capable of copyright protection. Cube27 retains ownership of its platform, software, documentation, methods and branding.
You are responsible for having the rights, lawful basis, permissions and notices required for your submitted data, client projects, connected accounts and requested crawling.

## crawling | Website crawling
Starting a crawl, or enabling a supported schedule, authorises automated requests within the selected scope. Submit a website for Site Health only if you own, control, manage or otherwise have permission to analyse it.
The crawler retrieves public website information within scope, rate, network and response-size controls. It is not an authenticated crawler for private accounts, administration, checkout or payment areas, and does not offer permission to bypass access controls.
Extracted facts, technical signals, links and provenance may be retained to support reports and historical comparison. A cancelled crawl may retain evidence already collected. Public accessibility or a permissive robots file is not, by itself, a grant of ownership, a copyright licence or permission to disregard another person’s rights.

## integrations | Integrations, AI providers and BYOK
Connecting an account authorises access to the selected data and properties within the permissions you grant. You must be entitled to grant that access.
A bring-your-own-key (BYOK) credential authorises the provider calls you initiate or schedule through CiteLadder. Provider fees under your account are separate from CiteLadder fees unless the purchase expressly states otherwise. Provider terms, account settings and limits also apply.
Relevant prompts and project context may be sent to the provider used for an enabled AI feature. We do not sell Customer Data or use it to train third-party foundation models.
Disconnecting an integration stops future authorised access through that connection, but does not automatically erase previously imported evidence. Request deletion separately. Third-party services may change or become unavailable outside our control.

## external-clients | MCP, API access and external actions
Administrators must approve external clients and protect API and MCP tokens. An authorised client can receive data within its permissions and may retain copies under its own terms. Revocation stops future access; it cannot recall copies already received by that client.
AI suggestions and generated drafts require human review. Generation alone does not authorise publishing, billing changes or another consequential external action.

## acceptable-use | Acceptable use
Do not use the Service unlawfully; infringe privacy, confidentiality or intellectual-property rights; submit malware or stolen credentials; bypass access or usage restrictions; carry out unauthorised scraping or security testing; overload systems; or access another workspace without permission.
Do not intentionally submit payment-card secrets, government identifiers, sensitive health information or other highly sensitive personal data. Do not reverse engineer proprietary Service components except where applicable law permits it.
We may restrict activity reasonably necessary to address abuse, security risks, legal requirements or overdue undisputed fees.

## responsibility | Your responsibility for use of the Service
CiteLadder provides data, measurements, analysis and generated material for your own evaluation. It is not legal, financial, marketing or other professional advice, and you decide what to do with it.
You are solely responsible for how the Service and anything obtained from it are used by you, your users, your clients, and any external client you authorise, including AI assistants connected through the API or MCP. That covers the decisions you make, the content you publish, and where you share data.
To the extent permitted by law, Cube27 is not responsible or liable for any misuse of the Service or its outputs by you or by anyone using your account, credentials, tokens or authorised clients. It is also not responsible for data once it has been delivered to an external client, or for how that client or its provider handles it.
Search results, AI answers, crawled web content and other third-party data are provided as received from their sources, without any warranty of accuracy, completeness or lawfulness. Cube27 does not endorse third-party content that appears in the Service.

## fees | Fees, renewal and taxes
The checkout or signed order states the price, currency, billing period, allowances, renewal terms and applicable taxes. A recurring subscription renews each month as disclosed until cancelled. We will not start another paid order without the authorisation that purchase requires.
BYOK provider charges are payable separately to your provider. Indian prices are shown exclusive of GST where stated, with the total shown before payment. Tax treatment depends on the transaction and applicable requirements, not solely on a foreign billing address.
Razorpay processes payments. Cube27 is the supplier of the Service. Failed, reversed or disputed payments may affect paid access.
A future pricing change will be communicated before it takes effect, with an opportunity to cancel. Completed purchases and issued invoices are not retrospectively repriced.

## purchases | Trials, plan changes and additional purchases
Where granted, an invitation-based trial requires no payment card and does not automatically convert into a paid subscription. Its features and limits are shown when it is granted.
An upgrade takes effect after you confirm and pay the displayed prorated charge. A downgrade takes effect at the next renewal without a mid-period refund.
Add-ons and top-ups are one-time purchases. Each stays usable until 30 days after successful payment or the end of your paid subscription, whichever comes first. Use requires an active paid subscription: a lapse stops use, and renewing before the original expiry restores the remaining eligible use without extending that expiry. They neither renew automatically nor extend the base subscription.

## cancellation | Cancellation and refunds
Cancel before the next renewal in the app’s Billing section or, if that control is unavailable, by a verified request to ${PARENT_COMPANY.email}. Cancellation takes effect at the end of the verified paid period, with no cancellation fee, and does not by itself produce a prorated refund.
Refund eligibility, processing and effects on access are set out in the Refund Policy at /refund-policy. Statutory rights are unaffected.

## confidentiality | Confidentiality and security
Each party will protect the other’s non-public confidential information, use it only for this agreement and disclose it only to authorised recipients with appropriate obligations, or as law requires. This does not cover information independently developed, lawfully obtained without restriction or publicly available without breach.
We maintain reasonable technical and organisational safeguards. No online service can guarantee absolute security.

## feedback | Telemetry and feedback
We may use operational telemetry and genuinely de-identified, aggregated information for security, reliability and product operations. This does not permit disclosure of confidential project information or re-identification.
You allow us to use voluntarily provided product feedback without payment, but not to publish your name, logo or confidential information as a testimonial without permission.

## termination | Changes, suspension and termination
We may improve or change the Service and will give reasonable advance notice of a material reduction to purchased functionality where practicable. If we discontinue a paid Service without your breach and cannot provide a reasonably acceptable alternative, we will refund the unused prepaid portion attributable to it.
Either party may terminate for a material breach not remedied within 30 days after written notice. We may suspend or terminate sooner for unlawful activity, serious security risks or a breach that cannot reasonably be remedied.
Ending a subscription does not immediately delete Customer Data; the Privacy Policy describes export and deletion. Payment obligations already accrued and provisions intended to survive remain effective.

## liability | Warranties and liability
We will provide the Service with reasonable care and skill. Except for express commitments and rights that cannot lawfully be excluded, the Service is provided on an “as available” basis without a guarantee of uninterrupted availability or error-free third-party outputs.
To the extent permitted by law, neither party is liable for indirect or consequential loss, or loss of profits, revenue or goodwill arising from this agreement.
To the extent permitted by law, Cube27’s aggregate liability relating to the Service will not exceed the fees paid or payable for the affected Service during the 12 months preceding the event giving rise to the claim. This does not limit liability for fraud, wilful misconduct or any liability that applicable law does not permit to be limited. A signed enterprise agreement may specify different terms.

## claims | Third-party claims
To the extent permitted by law, you will defend and indemnify Cube27 against third-party claims arising from your unlawful Customer Data; unauthorised crawling or connected-account access; the use or misuse of the Service, its outputs or data obtained through the API or MCP by you, your users or your authorised clients; or material violation of another person’s rights. This does not apply to the extent a claim is caused by Cube27’s breach or misconduct.

## law | Governing law and other terms
Indian law governs these Terms. Subject to mandatory rights and a signed agreement providing otherwise, the courts of competent jurisdiction in Pune, Maharashtra have jurisdiction over disputes.
Material adverse changes to these Terms will be notified before taking effect where practicable. Changes do not retrospectively remove accrued rights. If a provision is unenforceable, the remaining provisions continue. A delay in exercising a right is not a waiver.

## contact | Contact
${OPERATOR_LINE}
Email: ${PARENT_COMPANY.email}
`),
};
