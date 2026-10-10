/**
 * FAQ content for /faq, aligned to the governed product loop in
 * docs/architecture.md.
 *
 * Commercial amounts, quotas and availability come from the published catalog.
 * Keep answers short and specific,
 * and never invent numbers, customers, or certainty.
 */

export type FaqItem = {
  q: string;
  a: string;
  links?: readonly { label: string; href: string }[];
};

export type FaqGroup = {
  heading: string;
  items: readonly FaqItem[];
};

function faqItem(q: string, a: string, links?: FaqItem['links']): FaqItem {
  return { q, a, links };
}

export const FAQ_GROUPS: readonly FaqGroup[] = [
  {
    heading: 'Platform',
    items: [
      faqItem(
        'What is CiteLadder?',
        'CiteLadder is AI visibility software that helps teams inspect brand mentions, cited sources and competitor presence in tracked AI answers. It connects that answer evidence with website findings so teams can investigate what to improve.',
        [{ label: 'Explore AI share of voice', href: '/ai-search-share-of-voice' }],
      ),
      faqItem(
        'What is AEO?',
        'Answer engine optimization is the work of making your organization, pages, and claims easier for AI answer engines to find, understand, and cite. Traditional SEO still helps people discover the page. AEO asks whether the engine uses that page when it writes the answer. The two share crawl access, clear structure, and consistent facts. They are measured differently.',
      ),
      faqItem(
        'How does AEO relate to SEO?',
        'SEO is about ranking and using a results page. AEO is about being named or cited inside a generated answer. A page can rank well and still never appear in ChatGPT. A page can be cited in an answer and send little classic organic traffic. CiteLadder puts site health, Search Console, GA4, content work, and AI visibility in one workflow so those views are not siloed.',
      ),
      faqItem(
        'What is the difference between a mention and a citation?',
        'A mention means a brand or product appears in the answer text. A citation identifies a source referenced by the answer. Neither observation, on its own, proves a referral visit or a purchase.',
        [{ label: 'Explore citation tracking', href: '/ai-citation-tracking' }],
      ),
      faqItem(
        'Which engines and sources can I track?',
        'Available engines and collection options depend on the current product configuration and the providers you connect. Check availability when setting up your project, and keep the collection source in view when interpreting a result.',
      ),
      faqItem(
        'Do these observations represent every answer a consumer will see?',
        'No. Results reflect the prompts, source and conditions used for the observation. Consumer experiences can differ because of factors such as account context, location, conversation history and collection method.',
        [{ label: 'Understand AI share of voice', href: '/ai-search-share-of-voice' }],
      ),
      faqItem(
        'How is the product organized?',
        'CiteLadder keeps AI visibility, source analysis, Site Health and connected workflows in one project. Open the evidence behind each observation to decide what to investigate next.',
      ),
      faqItem(
        'How does the growth loop work?',
        'Connect evidence, analyze and prioritize gaps, declare an implemented action, observe later crawl or audit evidence, and track comparable outcomes. Verification reports what was observed afterwards. It does not claim causality.',
      ),
      faqItem(
        'Does CiteLadder measure AI visibility?',
        'Yes. AI Visibility is the Track station. It records how answer engines mention and cite your brand and competitors. Every metric traces back to stored responses from a versioned prompt portfolio.',
      ),
      faqItem(
        'Can CiteLadder create content?',
        'Content Intelligence uses Agent workflows to prepare briefs, proposed page edits and internal-link plans. Review factual claims and source support before implementation. Nothing is published automatically, and Agent access is not included in the public trial.',
        [{ label: 'Content Intelligence', href: '/platform/content-intelligence' }],
      ),
      faqItem(
        'Which analytics sources can I connect?',
        'Connect supported Google Search Console, GA4 and Bing evidence. Demand Intelligence examines first-party queries and pages; AI Referral Analytics examines identifiable GA4 visits and reported outcomes. Connection, mapping and coverage requirements apply.',
        [{ label: 'Integrations', href: '/platform/integrations' }],
      ),
      faqItem(
        'What do I actually have to do?',
        'You make the product decisions that matter: save a piece of content, and run or schedule an audit. There is no approval queue or review inbox. CiteLadder shows the evidence work between those decisions with its source, status, and limitations.',
      ),
      faqItem(
        'What does "evidence-grounded" mean concretely?',
        'Every derived number opens the artifact it came from: the crawl, the imported row, or the engine answer, stored as it was observed. A claim with no resolvable source does not render as a conclusion. Scores show their coverage beside them. They are not rescaled over whatever happened to be measurable, because missing evidence usually marks a weakness rather than a neutral gap.',
      ),
      faqItem(
        'What does CiteLadder not claim?',
        'It does not claim that a change caused a ranking, traffic, or revenue outcome. Verification recrawls and reports what it observes afterwards. CiteLadder does not present aggregate correlations as causal. Unavailable, not configured, and genuinely zero are three different states, not one empty chart.',
      ),
    ],
  },
  {
    heading: 'Site Health',
    items: [
      faqItem(
        'What does Site Health analyze?',
        'Site Health safely crawls your website, records the acquired page as evidence, classifies its structural purpose, and applies deterministic checks suited to that page type. It persists scores, issues, architecture snapshots, changes, and prioritized opportunities so you can inspect every result.',
      ),
      faqItem(
        'How does CiteLadder decide which checks apply to a page?',
        'Classification uses observable evidence such as the URL path, headings, visible content, forms, links, delivery signals, and structured data. The resulting page type selects the relevant checklist and schema contract. Structured data is one signal and never certifies its own page type.',
      ),
      faqItem(
        'What happens when a page cannot be classified confidently?',
        'CiteLadder classifies the page as other instead of forcing it into the wrong type. General checks can still run, while page-type-specific rules stay out of scoring until the evidence supports a reliable classification.',
      ),
    ],
  },
  {
    heading: 'Data & security',
    items: [
      faqItem(
        'How is my data isolated?',
        'Every customer fact is scoped to its workspace and project and never crosses workspaces. CiteLadder versions product rules and analyzers independently, so stored results keep their source and you can read them against the rules that produced them.',
      ),
      faqItem(
        'Can I see the evidence behind a recommendation?',
        'Yes. Every recommendation carries a typed evidence chain back to the crawl, integration import, or answer that produced it. Later observations append to the record. They do not rewrite earlier evidence.',
      ),
      faqItem(
        'Does anything publish or change automatically?',
        'No. Saving content and running or scheduling an audit are your decisions, and the API enforces both, not only the interface. Crawling, classification, gap detection, and prioritization run without asking, and each result appears with the evidence behind it.',
      ),
      faqItem(
        'Do I need my own API keys?',
        'Model calls run on your own provider keys, billed to your provider accounts at their rates and never marked up. Provider secrets are encrypted at rest and resolved only at execution time. They are never returned, logged, or placed in a prompt.',
      ),
      faqItem(
        'Who operates CiteLadder?',
        'CiteLadder is a Cube27 product. Cube27 IT Pvt. Ltd. operates from Plot No. 12, Mulberry Gardens 1, Magarpatta City, Hadapsar, Pune, Maharashtra 411013, India. Product is led by Abhineet Jain. Arpan Jain is Founder and CEO. Privacy and terms are Cube27 documents.',
      ),
    ],
  },
  {
    heading: 'Account & billing',
    items: [
      faqItem(
        'What is included in the current public trial?',
        'The seven-day trial includes one project, 20 prompts, 20 monitored URLs and ChatGPT-only access, with 20 successful answers and one successful answer per prompt under the current trial rules. Agent access and AI credits are not included. Contact us to continue after the trial or discuss advanced workflows.',
        [
          { label: 'Explore AI Visibility', href: '/platform/ai-visibility' },
          { label: 'Discuss access', href: '/contact' },
        ],
      ),
      faqItem(
        'How much does CiteLadder cost?',
        'See the pricing page for published plans and whether self-serve checkout is open. Contact us to continue after the trial or to discuss an enterprise agreement. Under BYOK, provider usage is billed to your connected accounts without a CiteLadder markup.',
      ),
      faqItem(
        'Do you mark up model usage?',
        'Under BYOK, provider usage bills directly to your connected accounts without a CiteLadder markup. Funding and access for other workflows depend on the account setup. See the pricing page for current options.',
      ),
      faqItem(
        'How do I get started?',
        'Book a demo to discuss your use case and current access options. Published plans and availability information are on the pricing page.',
        [{ label: 'View pricing', href: '/pricing' }],
      ),
      faqItem(
        'Can I change plan later?',
        'Contact us to discuss a change in access or capacity. Current paid checkout availability and published plan information are shown on the pricing page.',
      ),
    ],
  },
];
