import { PARENT_COMPANY, type LegalDocument } from './legal';
import { legalSections } from './legal-text';

/**
 * CiteLadder Privacy Policy. Retention windows, response-time targets and
 * provider-specific commitments are still owner decisions, so this version
 * states only what the product does today and what the law already requires.
 */
export const PRIVACY_POLICY: LegalDocument = {
  slug: 'privacy',
  title: 'Privacy Policy',
  description: 'What personal data CiteLadder processes, why, and the choices you have.',
  sections: legalSections(`
## who | Who we are
${PARENT_COMPANY.legalName} (“Cube27”, “we”, “us”) operates CiteLadder. Our principal business address is ${PARENT_COMPANY.address}. Contact us at ${PARENT_COMPANY.email}.
This Policy covers the CiteLadder website, hosted application, account administration, purchases, support and data processed through CiteLadder features. For our own account, billing, security and support purposes we decide why and how personal data is processed. For personal data processed on a customer’s instructions, we act on behalf of that customer.

## information | Information we process
- Account and workspace — name, work email, authentication identifiers, organisation, roles, invitations and settings, used for sign-in, administration and permissions.
- Billing and tax — billing name, address and country, tax identifiers, plan, transaction references, invoices and payment or refund status, used for payments, entitlements, accounting, tax and disputes.
- Project configuration — domains, brand and competitor information, prompts, markets, languages and selected providers, used to configure analysis and monitoring.
- Website evidence — URLs, publicly accessible page content, technical metadata, extracted facts, links, crawl results and provenance, used for Site Health, reports and comparison.
- AI and content — prompts, relevant project context, instructions, generated responses and drafts, citations and execution metadata, used for requested AI assistance and visibility measurement.
- Connected sources — selected properties, encrypted credentials, search and analytics data, imported payloads and sync history, used for authorised integrations and analysis.
- Usage and security — IP address, timestamps, device and browser information, requests, errors and operational events, used for security, abuse prevention and reliability.
- Support — messages and any details you choose to provide, used to help you and handle complaints.
- Cookies and browser storage — described in our Cookie Policy at /cookies.

## payment-and-public-data | Payment details and public information
CiteLadder does not store complete payment-card numbers, card security codes or payment-authentication secrets. Razorpay, our payment processor, handles those details.
Public pages and search results may contain personal information. Public availability does not remove our responsibility to handle that information lawfully.

## purposes | Sources and purposes
We receive information from you and your workspace users, connected accounts, customer-authorised website requests, selected AI, research and data providers, our payment processor, and your use of the Service.
We use it to deliver requested features, preserve project evidence, manage accounts and billing, respond to support requests, protect the Service, keep it reliable and meet legal obligations. We use only the data reasonably needed for the relevant purpose. Where consent is required, we ask for it for the identified purpose, and optional consent is never a condition of unrelated essential features.

## evidence | Website and project evidence
A requested crawl processes page bodies to extract relevant information. Extracted content, findings, links and technical provenance can remain in the workspace for history and comparison. AI responses and connected-provider imports may be retained as evidence. Evidence can contain personal or confidential information.

## ai | AI providers and data use
An enabled AI feature may send your prompt and relevant project context to the provider used for that feature. BYOK calls also run under your own provider account and settings.
We do not sell Customer Data or use it to train third-party foundation models, and we do not disclose one customer’s private project information to another customer. Provider retention and processing depend on the provider’s service, agreement and configuration; we do not promise that every provider deletes data immediately.

## connected-accounts | Connected Google and other accounts
We access only the permissions and properties you authorise for an integration. Depending on what you connect, this may include search queries, pages, impressions, clicks, analytics events and associated reporting data. We may retain imported data and derived reports to provide the requested features.
You may disconnect an integration or revoke permissions through the provider. This stops future access; it does not automatically erase imported history. You can request deletion of that history separately.

## recipients | Recipients and external clients
We disclose data as needed to infrastructure, AI, research, monitoring and support providers that help us run the Service; to our payment processor; and to connected platforms under your instructions.
Workspace administrators and authorised members may access information according to their roles. If you authorise an API or MCP client, that client receives the data returned within its permissions and its provider may retain it independently. Once delivered, that data is handled under the client’s terms, not ours, and we are not responsible for it. Revoking access stops future requests.
We may also disclose information to advisers or authorities where necessary and lawful.

## retention | Retention, export and deletion
We retain project data while your workspace needs it for the Service. Cancelling a subscription does not immediately delete your workspace or its history.
You can ask us to export supported Customer Data or delete your data by emailing ${PARENT_COMPANY.email}. We will verify your identity and authority, then act on the request within the period applicable law requires.
We may keep limited billing, tax, accounting, consent, security, fraud or dispute records for the period the law requires. Third-party providers and external clients you authorised may retain their own copies under their terms.

## security | Security and international processing
We use safeguards appropriate to the data and risks, including controlled workspace access, protected credentials, encrypted transport and operational security measures. No online service provides absolute security.
We operate from India. Our providers may process information in other countries. We do not promise storage in any particular country unless a signed agreement says so.

## rights | Your choices and requests
Depending on applicable law, you may request access to, correction of, erasure of or a copy of your personal data; withdraw consent; object to or restrict certain processing; nominate a person where that right applies; or complain to the relevant authority.
Email ${PARENT_COMPANY.email}. We may ask for proportionate verification. Withdrawing consent does not invalidate earlier lawful processing but may stop a feature that needs the data. For data controlled by your organisation, direct the request to its workspace administrator; we will assist that organisation as the law requires.

## children | Children
CiteLadder accounts are for adults aged 18 or over. The Service is not directed to children. Contact us if you believe a child’s data has been collected inappropriately.

## updates | Updates and contact
We update this Policy when our practices change and give notice of material changes where required.
Questions or complaints: ${PARENT_COMPANY.email}, or ${PARENT_COMPANY.legalName}, ${PARENT_COMPANY.address}. Our contact page at /contact lists every channel. You keep the right to approach the relevant authority.
`),
};
