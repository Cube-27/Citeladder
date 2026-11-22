import { PUBLIC_TRIAL } from '@/lib/config/public-trial';

import { countWord, projectCount } from './count-words';

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
        'CiteLadder is AI visibility software. It records how AI answer engines answer the questions you track, which brands they name and which sources they cite. It also crawls your website, so you can see which of your own pages to improve.',
        [{ label: 'Explore AI share of voice', href: '/ai-search-share-of-voice' }],
      ),
      faqItem(
        'What is AEO?',
        'Answer engine optimization (AEO) is the work of making your organization, pages and claims easy for AI answer engines to find, understand and cite. SEO helps people find your page in search results. AEO asks whether an engine uses your page when it writes an answer. Both depend on crawl access, clear structure and consistent facts. They are measured differently.',
      ),
      faqItem(
        'How does AEO relate to SEO?',
        'SEO is about ranking on a results page. AEO is about being named or cited inside a generated answer. A page can rank well and never appear in ChatGPT. A page can be cited in answers and send little organic traffic. In CiteLadder, Site Health, Search Console, GA4, content work and AI visibility sit in the same project, so you can look at a page from both sides.',
      ),
      faqItem(
        'What is the difference between a mention and a citation?',
        'A mention means a brand or product appears in the answer text. A citation identifies a source referenced by the answer. Neither observation, on its own, proves a referral visit or a purchase.',
        [{ label: 'Explore citation tracking', href: '/ai-citation-tracking' }],
      ),
      faqItem(
        'Which engines and sources can I track?',
        'CiteLadder tracks ChatGPT, Claude, Gemini, Google AI Overviews and Google AI Mode. Which of them run for you depends on your plan and project setup; the public trial runs ChatGPT only. Every result shows which engine and collection method produced it.',
      ),
      faqItem(
        'Do these observations represent every answer a consumer will see?',
        'No. Results reflect the prompts, source and conditions used for the observation. Consumer experiences can differ because of factors such as account context, location, conversation history and collection method.',
        [{ label: 'Read the AI citation tracking guide', href: '/ai-citation-tracking' }],
      ),
      faqItem(
        'How is the product organized?',
        'Each project holds AI Visibility, source analysis, Site Health and your connected accounts. Every number opens the observation behind it, so you can decide what to look into next.',
      ),
      faqItem(
        'What does a typical cycle look like?',
        'You connect your data. CiteLadder finds and ranks the gaps. You record the change you made, and a later crawl or audit shows what was observed afterwards. That check reports what it saw. It does not claim your change caused it.',
      ),
      faqItem(
        'Does CiteLadder measure AI visibility?',
        'Yes. AI Visibility records how answer engines mention and cite your brand and your competitors. Every metric traces back to stored answers from a versioned set of prompts.',
      ),
      faqItem(
        'Can CiteLadder create content?',
        'Content Optimization lists the content angles competitor and publisher pages are cited for in AI answers and your site lacks, each as a page to improve or a new page to write. The Agent drafts the page from that evidence, and also prepares briefs, proposed page edits and internal-link plans. Check the facts and their sources before you put anything live. Nothing is published automatically, and the public trial does not include the Agent.',
        [{ label: 'Content Optimization', href: '/platform/content-optimization' }],
      ),
      faqItem(
        'Which analytics sources can I connect?',
        'Google Search Console, GA4 and Bing. Search Demand works on your own search queries and pages. AI Referral Analytics works on the GA4 visits it can attribute to AI assistants and the outcomes GA4 reports for them. Each source has to be connected and mapped to your project first.',
        [{ label: 'Integrations', href: '/platform/integrations' }],
      ),
      faqItem(
        'What do I actually have to do?',
        'Two things: you save a piece of content, and you run or schedule an audit. There is no approval queue or review inbox. Everything CiteLadder does in between shows its source, its status and its limits.',
      ),
      faqItem(
        'What does "evidence-grounded" mean in practice?',
        'Every number opens the record it came from: the crawl, the imported row or the engine answer, stored as it was observed. A claim with no source is not shown as a conclusion. Each score shows its coverage next to it and is not rescaled to whatever could be measured, because missing evidence usually points to a weakness.',
      ),
      faqItem(
        'What does CiteLadder not claim?',
        'It does not claim that a change caused a ranking, traffic or revenue outcome. Verification recrawls and reports what it sees afterwards. Aggregate correlations are never presented as causes. Unavailable, not configured and a real zero are shown as three different states.',
      ),
    ],
  },
  {
    heading: 'Site Health',
    items: [
      faqItem(
        'What does Site Health analyze?',
        'Site Health crawls your website, stores each fetched page, works out what kind of page it is and runs the checks that fit that page type. You get scores, issues, site architecture snapshots, changes since the last crawl and a ranked list of opportunities. Each result opens the page evidence behind it.',
      ),
      faqItem(
        'How does CiteLadder decide which checks apply to a page?',
        'It looks at what it can observe on the page: the URL path, headings, visible content, forms, links, delivery details and structured data. The page type it settles on picks the checklist and schema rules. Structured data is one clue among these and never decides the page type by itself.',
      ),
      faqItem(
        'What happens when a page cannot be classified confidently?',
        'CiteLadder labels it as other and does not force it into a type. General checks still run. Checks for a specific page type stay out of the score until the evidence supports that type.',
      ),
    ],
  },
  {
    heading: 'Data & security',
    items: [
      faqItem(
        'How is my data isolated?',
        'Everything you store belongs to one workspace and project, and never crosses into another workspace. Product rules and analyzers each carry their own version, so every stored result keeps its source and the rules that produced it.',
      ),
      faqItem(
        'Can I see the evidence behind a recommendation?',
        'Yes. Every recommendation links back to the crawl, integration import or answer that produced it. New observations are added to the record and never overwrite earlier evidence.',
      ),
      faqItem(
        'Does anything publish or change automatically?',
        'No. Saving content and running or scheduling an audit are your decisions, and the API enforces both, so a script cannot skip them either. Crawling, classification, gap detection and prioritization run on their own, and each result shows the evidence behind it.',
      ),
      faqItem(
        'Do I need my own API keys?',
        'No. Every plan can run on CiteLadder’s provider keys or on your own. With your own keys (BYOK), answer-engine and research calls bill to your provider accounts at their rates with no CiteLadder markup, and the plan costs less. The Agent always runs on CiteLadder’s keys and uses AI credits. Your provider secrets are encrypted at rest and read only when a call runs. They are never returned, logged or placed in a prompt.',
      ),
      faqItem(
        'Who operates CiteLadder?',
        'CiteLadder is a Cube27 product. Cube27 IT Pvt. Ltd. operates from Plot No. 12, Mulberry Gardens 1, Magarpatta City, Hadapsar, Pune, Maharashtra 411013, India. Product is led by Abhineet Jain. Arpan Jain is Founder and CEO. CiteLadder publishes its own legal pages, which bind Cube27 IT Private Limited.',
      ),
    ],
  },
  {
    heading: 'Account & billing',
    items: [
      faqItem(
        'What is included in the current public trial?',
        `The ${countWord(PUBLIC_TRIAL.days)}-day trial includes ${projectCount(PUBLIC_TRIAL.projects)}, ${PUBLIC_TRIAL.prompts} prompts, ${PUBLIC_TRIAL.monitoredUrls} monitored URLs and ChatGPT-only access, with ${PUBLIC_TRIAL.answers} successful answers and one successful answer per prompt under the current trial rules. It includes ${PUBLIC_TRIAL.aiCredits} AI credits; Agent access is not included. Contact us to keep going after the trial or to ask about the rest of the product.`,
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
        'Under BYOK, provider usage bills directly to your connected accounts without a CiteLadder markup. The Agent runs on CiteLadder’s keys and uses AI credits from your plan. See the pricing page for current options.',
      ),
      faqItem(
        'How do I get started?',
        'Book a demo and tell us what you want to track. We will show you the access options open today. Published plans are on the pricing page.',
        [{ label: 'View pricing', href: '/pricing' }],
      ),
      faqItem(
        'Can I change plan later?',
        'Contact us to change your access or capacity. The pricing page shows the published plans and whether paid checkout is open.',
      ),
    ],
  },
];
