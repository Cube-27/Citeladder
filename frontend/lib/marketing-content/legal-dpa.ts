import { PARENT_COMPANY, type LegalDocument } from './legal';

/**
 * The Data Processing Agreement and the provider list it relies on.
 *
 * The provider rows come from an audit of the code and production
 * configuration (24 September 2026), not from the review draft's template.
 * Each row names only a service the product actually calls. The crawler, a
 * dormant monitoring option and unconfigured sign-in providers are
 * deliberately absent. When a provider is added, removed or re-routed, this
 * list changes in the same pull request.
 */
const email = PARENT_COMPANY.email;

export const DATA_PROCESSING_AGREEMENT: LegalDocument = {
  slug: 'dpa',
  title: 'Data Processing Agreement',
  description:
    'How Cube27 processes personal data on a customer’s behalf when it provides CiteLadder.',
  sections: [
    {
      id: 'scope',
      title: 'Scope and roles',
      paragraphs: [
        `This Data Processing Agreement (“DPA”) forms part of the agreement between ${PARENT_COMPANY.legalName} (“Cube27”) and the customer (“Customer”) under the Terms of Service at /terms, wherever Cube27 processes personal data on the Customer’s behalf through CiteLadder (“Customer Personal Data”).`,
        'The Customer is the controller, or Data Fiduciary, of Customer Personal Data, or a processor acting for its own controller. Cube27 acts as the Customer’s processor or subprocessor. Personal data Cube27 processes for its own account, billing and security purposes is covered by the Privacy Policy at /privacy, not by this DPA.',
      ],
    },
    {
      id: 'instructions',
      title: 'Instructions and responsibilities',
      paragraphs: [
        'Cube27 processes Customer Personal Data only to provide and secure the Service, on the Customer’s documented instructions. Those instructions are given through the Customer’s configuration and use of the Service, through a signed agreement, or where law requires. Cube27 will tell the Customer if an instruction appears to break the law, unless the law prohibits telling it.',
        'The Customer is solely responsible for the lawfulness of its instructions and of the data it submits, connects or asks the Service to collect, including having a lawful basis, the necessary notices and permissions, and the right to submit any third party’s information. Cube27 is not responsible for processing carried out on the Customer’s instructions, or for the Customer’s own use of data or outputs obtained from the Service.',
      ],
    },
    {
      id: 'schedule',
      title: 'Processing details',
      table: {
        caption: 'Details of the processing',
        headings: ['Item', 'Description'],
        rows: [
          [
            'Subject matter',
            'Providing CiteLadder website analysis, search and AI-visibility measurement, content assistance, integrations, reports, API and MCP access.',
          ],
          [
            'Duration',
            'The service term, plus the export, deletion and legally required retention periods in the Privacy Policy.',
          ],
          [
            'Operations',
            'Collection, storage, organisation, extraction, analysis, transmission, display, return and deletion.',
          ],
          [
            'Data subjects',
            'The Customer’s users and personnel; its clients’ users; people whose information appears in material the Customer supplies, on websites it asks the Service to analyse, or in accounts it connects.',
          ],
          [
            'Data categories',
            'Business contact details and identifiers; project configuration and prompts; page, search and analytics data; returned evidence and generated outputs; usage and support information.',
          ],
          [
            'Sensitive data',
            'Not intended. The Customer must not submit special-category, children’s or other highly sensitive personal data.',
          ],
        ],
      },
    },
    {
      id: 'security',
      title: 'Confidentiality and security',
      paragraphs: [
        'Cube27 limits access to Customer Personal Data to authorised personnel bound by confidentiality. It maintains measures appropriate to the risks, including authentication and workspace permissions, encrypted provider and integration credentials, encrypted transport, restricted infrastructure access, and bounded, network-restricted web acquisition.',
        'No certification is implied by this DPA, and no online service can guarantee absolute security.',
      ],
    },
    {
      id: 'subprocessors',
      title: 'Subprocessors',
      paragraphs: [
        'The Customer authorises Cube27 to use the subprocessors listed at /subprocessors for the purposes stated there. Cube27 imposes data-protection obligations on each subprocessor that are no less protective than the law requires, and remains responsible for their performance of those obligations.',
        'Cube27 will give at least 30 days’ notice before adding or replacing a subprocessor, by updating that page and notifying the Customer’s workspace owners. The Customer may object on reasonable data-protection grounds within 15 days of the notice. If the parties cannot resolve the objection, either may end the affected part of the Service, and Cube27 will refund any unused prepaid fees for it. A change urgently needed for security or service continuity may take effect sooner, with notice as soon as practicable.',
        'Providers the Customer connects under its own credentials, such as its own AI provider keys or its Google and Bing accounts, act under the Customer’s agreement with that provider and are not Cube27’s subprocessors.',
      ],
    },
    {
      id: 'assistance',
      title: 'Requests and assistance',
      paragraphs: [
        'Cube27 will promptly pass to the Customer any request it receives from an individual about Customer Personal Data, and will give reasonable help with access, correction, deletion and other requests, security obligations and impact assessments, taking into account the information available to it.',
      ],
    },
    {
      id: 'breaches',
      title: 'Personal-data breaches',
      paragraphs: [
        'Cube27 will notify the Customer without undue delay after becoming aware of a breach affecting Customer Personal Data, and within any shorter period the law requires. It will share what it knows as it becomes available, take reasonable steps to contain the breach, and cooperate with the Customer. The Customer remains responsible for its own notifications to authorities and individuals unless the law provides otherwise.',
      ],
    },
    {
      id: 'transfers',
      title: 'International transfers',
      paragraphs: [
        'CiteLadder is hosted in India. Some subprocessors process data in other countries, as the subprocessor list shows. Where the law requires a transfer mechanism for that processing, Cube27 will put it in place.',
      ],
    },
    {
      id: 'deletion',
      title: 'Return and deletion',
      paragraphs: [
        'When the Service ends, or earlier on a verified instruction, Cube27 will return supported Customer Personal Data or delete it, as described in the Privacy Policy. Cube27 may keep records the law requires it to keep, protected and used only for that purpose.',
        'Copies already delivered to an external client the Customer authorised, such as an AI assistant connected through MCP or the API, are outside Cube27’s control and are not covered by this obligation.',
      ],
    },
    {
      id: 'audits',
      title: 'Information and audits',
      paragraphs: [
        'Cube27 will make available the information reasonably needed to show compliance with this DPA, starting with its documentation. Any further audit the law requires is subject to reasonable notice, confidentiality and scope, and must not expose other customers’ data.',
      ],
    },
    {
      id: 'liability',
      title: 'Liability and precedence',
      paragraphs: [
        'Each party’s liability under this DPA is subject to the limitations and exclusions in the Terms of Service, to the extent the law permits. This DPA prevails over the Terms only for Customer Personal Data, and a signed enterprise agreement prevails where it expressly says so.',
        `Contact: ${email}.`,
      ],
    },
  ],
};

export const SUBPROCESSORS: LegalDocument = {
  slug: 'subprocessors',
  title: 'Subprocessors',
  description: 'The service providers that process data for CiteLadder, and why.',
  sections: [
    {
      id: 'subprocessors',
      title: 'Subprocessors',
      paragraphs: [
        `${PARENT_COMPANY.legalName} uses these providers to run CiteLadder. Each receives only the data its purpose needs.`,
      ],
      table: {
        caption: 'Subprocessors of CiteLadder',
        headings: ['Provider', 'Purpose', 'Data processed', 'Location'],
        rows: [
          [
            'Google Cloud',
            'Hosting the application, database, file storage and backups',
            'All workspace data held by the Service',
            'India (Mumbai region)',
          ],
          [
            'Cloudflare',
            'Website and app delivery, DNS, security and request routing',
            'Requests passing through, including IP addresses and page traffic',
            'Global network',
          ],
          [
            'OpenAI',
            'Platform-provided AI assistance, such as the Agent, when you have not set your own provider',
            'Your instructions and the relevant project context',
            'United States',
          ],
          [
            'Keenable',
            'Web research for brand and competitor discovery',
            'Research queries such as brand, domain and competitor names',
            'United States',
          ],
          [
            'Tavily',
            'Web search for commerce competitor research',
            'Search queries such as product and competitor names',
            'United States',
          ],
        ],
      },
    },
    {
      id: 'your-providers',
      title: 'Providers you connect',
      paragraphs: [
        'When you connect a provider under your own credentials, that provider acts under your agreement with it, not as our subprocessor. We send it only the requests you configure or run.',
      ],
      bullets: [
        'AI answer engines and assistants you set in Providers settings, such as OpenAI, Anthropic and Google Gemini, under your own API keys. This includes any Agent model you choose.',
        'DataForSEO, under your own credentials, for Google AI Overview and search intelligence data.',
        'Google Search Console, Google Analytics and Bing Webmaster Tools, for the properties you authorise.',
        'Google sign-in, when you choose it to sign in.',
        'MCP and API clients you authorise, such as an AI assistant, which receive the data they request under their own terms.',
      ],
    },
    {
      id: 'independent',
      title: 'Independent service providers',
      bullets: [
        'Razorpay processes payments as an independent payment provider under its own terms. We never receive full card details.',
        'Google Analytics measures website visits only when it is enabled and you accept optional cookies.',
      ],
    },
    {
      id: 'changes',
      title: 'Changes',
      paragraphs: [
        'We update this page before adding or replacing a subprocessor. Customers covered by the Data Processing Agreement at /dpa receive notice and can object as it describes.',
        `Questions about providers: ${email}.`,
      ],
    },
  ],
};
