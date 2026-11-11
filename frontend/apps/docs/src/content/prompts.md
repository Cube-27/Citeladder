---
title: 'Prompts and topics'
description: 'Track questions that represent real buying decisions, and keep their purpose clear.'
group: 'Measure and understand'
order: 100
updated: '2026-11-11'
---

A prompt is a question you want to investigate in AI search. Topics organize related questions; the prompt's cohort preserves what kind of question it is.

## Start with a decision, not a keyword list

Write questions a buyer could ask while understanding a problem, comparing approaches or choosing a product. Be specific about the audience and constraint when they matter.

For a fictional analytics company:

- "What should a small ecommerce team use to understand repeat purchases?"
- "Which analytics tools support a team without a data engineer?"
- "How does Example Analytics compare with another named product?"

The comparison prompt names a brand. Keep that framing separate from discovery questions where the answer has to introduce brands itself.

## Build prompts with the Prompt Builder

Open **Prompts** and choose **Prompt Builder**. It opens beside the prompt library in four steps, each prefilled from your project. Nothing is saved until a step's save or confirm button is used.

1. **About your business.** Check what you sell, who buys each offering, the situations and attributes that shape the choice, buyer roles, category terms, jobs to be done and your business model. Service areas appear for local and regional businesses. **Anything else for this run** steers this run only, without changing saved facts.
2. **Topics.** Keep, rename or remove your topics, or add your own. **Suggest topics** proposes buyer-facing categories from your saved offerings, without your brand or product-line names; each suggestion uses AI credits. **Confirm topics** saves the whole plan at once.
3. **Distribution.** Choose the number of prompts, the branded share (20% by default), the share of competitor-alternative questions (available once you track a competitor), the intent mix (25/50/25 by default), the personas to balance across, and whether to use your search data. Each search the run would use is listed by topic, and you can untick any of them.
4. **Review.** Accept the suggestions worth tracking. A coverage line for each topic and each part of the mix shows whether it is on target, short or empty; **More** on a short or empty line generates again for just that topic or share.

Suggestions are short questions about one need each, planned across awareness, consideration and decision. Questions that join two alternatives, run past 16 words or closely repeat another prompt are dropped before you see them, and a branded question may only describe you with attributes you confirmed.

The in-app Agent's prompt discovery skill writes a prompt plan following the same steps and links to the builder; it never writes or activates prompts. An assistant connected over [MCP](/mcp/tools/#make-changes) can run the same steps with your agreement.

## Review generated suggestions

Generated prompts use your project context. If the context is wrong, fix it in the builder's first step before growing the portfolio. Check for irrelevant markets, unsupported product claims and repetitive questions.

### Grounded in your search data

When Search Console is connected or you have published keyword research, generation looks at how your buyers already search for each topic and uses those searches as wording examples. Choose the source in the builder's **Distribution** step, or **None** to leave it out. Generation never copies a search as a prompt and ignores searches that name your brand or a competitor. Suggestions phrased this way are tagged **Informed by your search data**. Search impressions and keyword volume only decide which searches are used as examples; they are never presented as how often people ask AI assistants a prompt.

A suggestion is not permission to activate or run it. Use the review and activation controls in the app, then select the portfolio you want to measure.

## Shopping prompts

Commerce prompts measure your products and are generated from **Commerce**, not the Prompt Builder. Each one targets a category or a product.

- **A category's matrix.** On a category's page, **Shopping prompts matrix** generates one question for each buyer context and buying stage: three contexts, such as a beginner or a runner training for a marathon, at the consideration and decision stages. A few branded comparisons that name your brand are added, at most a fifth of the set. Branded comparisons stay out of organic visibility and product metrics, like other branded prompts.
- **Hero products.** For the products that matter most, **Generate 3 for this hero product** on the product's page adds questions about that product alone. Every other product is covered by its category's prompts.

Generated shopping prompts stay disabled until you approve them, and generation uses AI credits like other prompt generation. See [Commerce](/commerce/#prepare-shopping-prompts).

## Keep a stable baseline

A small, coherent portfolio is easier to interpret than a large collection of loosely related questions. Once you have a baseline, record deliberate changes to prompt wording, cohorts or engine selection. A [scheduled audit](/visibility/#schedule-audits) measures the same prompt set on a regular cadence.

Historical audits keep the prompt text and measurement context used at the time. Editing a prompt later does not rewrite an earlier answer.

## Read individual answers

When an aggregate looks surprising, open the underlying execution in **Runs**. Check the actual wording, brand observation and citation evidence before rewriting your strategy.

Missing, failed and not-run answers are different from successful answers that did not mention the brand.

## What to do next

Run an audit and use [AI Visibility](/visibility/) to inspect results. For product metrics and shopping prompts, use [Commerce](/commerce/).
