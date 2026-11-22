---
title: 'Buyer questions for Wise, drafted by four Claude models'
slug: '/buyer-prompts/wise'
meta_title: 'Buyer questions for Wise, drafted by four Claude models'
meta_description: 'Four Claude models wrote buyer questions for the same 12 Wise slots at low, medium and high effort, twice each. See what each wrote and what the code measured.'
primary_keyword: 'Wise buyer prompts'
secondary_keywords:
  [
    'international money transfer and multi-currency account service prompts',
    'AI visibility prompts',
    'buyer questions for AI search',
  ]
search_intent: 'See the buyer questions four Claude models draft for Wise and compare them'
content_type: 'model comparison page'
related_guides: ['/research/prompt-builder-model-comparison-2026', '/buyer-prompts/airbnb']
index_group: 'Consumer brands'
index_meta: 'international money transfer and multi-currency account service'
reviewed_at: '2026-11-07'
published_at: '2026-11-07'
author: 'Abhineet Jain'
product:
  heading: 'See how AI answers your buyers'
  href: '/platform'
  body: 'Once you have buyer questions like these for your own brand, CiteLadder shows how ChatGPT, Gemini, Claude, Google AI Overviews and Google AI Mode answer them and which pages they cite. It also gives you a ranked list of what to change on your site.'
---

CiteLadder's Prompt Builder drafts the buyer questions a brand tracks in AI answers. For this study we ran the same Prompt Builder step for Wise on four Claude models: Claude Haiku 5.5, Claude Sonnet 5.5, Claude Opus 5.5 and Claude Fable 5.1. Each ran at low, medium and high effort, twice per setting. The instructions, the business profile and the 12 planned question slots stayed the same. Only the model and the effort changed. The tables below list every question each model wrote. This page describes what can be observed in those questions. Judging their quality is left to the reader.

## What Wise sells and the four topics

The business profile describes Wise as an international money transfer and multi-currency account service. It is tagged as regulated finance, and it sells to both consumers and businesses. The profile lists four offerings, and each one became a topic:

- **International money transfer.** Transfers abroad to more than 140 countries at the mid-market exchange rate, with fees shown up front and a rate lock.
- **Multi-currency account.** Holds and converts 40+ currencies, with local account details in 22 currencies and an option to earn interest.
- **International debit card.** Spending and cash withdrawals in 215 countries and territories, with no hidden fees or markups.
- **International business account.** Paying and getting paid in 40+ currencies, with batch payments, team cards, accounting software connections and API access.

Each offering also carries lists of attributes, buyer situations and audiences. The slot plan draws on those lists.

## How the 12 slots were planned

Each topic got three slots. The pattern is the same for all four topics:

- **Slot 1, awareness stage.** Built on a buyer situation. Allowed intents: learn, solve, recommend.
- **Slot 2, consideration stage.** Built on an audience. Allowed intents: solve, recommend, compare, validate.
- **Slot 3, decision stage.** Built on an attribute. Allowed intents: compare, validate, buy, recommend.

The facets per topic were:

- International money transfer: supporting family abroad, expats, transparent upfront fees.
- Multi-currency account: getting paid by overseas clients, remote workers, holds 40+ currencies.
- International debit card: studying overseas, online shoppers, free ATM withdrawal allowance.
- International business account: expanding into new markets, finance teams, API access.

Every model received this same plan. So differences in the tables come from the model and the effort setting, not from the plan.

## What differs between the four models

**Length.** The questions are short across the board. The median is 10 words for Claude Haiku 5.5 and Claude Sonnet 5.5, and 11 words for Claude Opus 5.5 and Claude Fable 5.1. No model wrote a question over 16 words.

**Question marks.** Many questions are written as search-style phrases with no question mark. The share ending in a question mark is 36% for Claude Haiku 5.5, 51% for Claude Sonnet 5.5, 50% for Claude Opus 5.5 and 71% for Claude Fable 5.1.

**Openings and shape.** Claude Haiku 5.5 often starts with "Compare" or "Recommend". It also puts the question at the end after a comma, as in "Multi-currency accounts holding over 40 currencies, which should I compare?" Claude Sonnet 5.5 repeats a small set of phrasings, such as "I'm an expat, which money transfer service should I use?" Claude Opus 5.5 opens most of its family-transfer questions with "Cheapest way to send money to". Claude Fable 5.1 often opens with "Which", "Who offers" or a short scene such as "We're expanding into new countries".

**First-person framing.** All four models write some questions as a buyer speaking. Claude Haiku 5.5 uses role statements like "I'm an expat" and "I'm a remote worker". Claude Opus 5.5 and Claude Fable 5.1 use "our finance team" and "we" for the business slots, for example "Our finance team pays overseas suppliers, which business account should we switch to?"

**How specific.** For the "Holds 40+ currencies" slot, Claude Haiku 5.5 and Claude Sonnet 5.5 often keep the figure from the profile, as in "Compare multi-currency accounts that hold more than 40 currencies". Claude Opus 5.5 and Claude Fable 5.1 more often write "dozens of currencies", "the most currencies" or "the widest range of currencies". Claude Fable 5.1 adds time details in some debit card questions, such as "Starting university abroad next year, what debit card should I get?"

## Low, medium and high effort, and run 1 against run 2

Effort changes the wording in places, but the topics and the shape of each model's questions stay close across settings.

- **Claude Haiku 5.5** shows the most visible shift. At low effort many questions use the comma-then-question form. In medium effort run 1, none of the 12 questions ends with a question mark, and most open with "Compare", "Recommend" or "Looking for".
- **Claude Sonnet 5.5** repeats itself across settings. "I'm an expat, which money transfer service should I use?" appears in five of its six outputs. Several other questions recur word for word across efforts.
- **Claude Opus 5.5** keeps the "Cheapest way to send money to" opening for the first slot in all six outputs. At low effort both runs ask for "the most currencies". At medium effort both runs say "dozens of currencies at once".
- **Claude Fable 5.1** writes "Which travel debit cards include free ATM withdrawals abroad?" word for word in both medium runs and in high effort run 1.

Between run 1 and run 2 of the same setting, some questions are identical and others are reworded. For example, both Claude Haiku 5.5 low effort runs open with "Best way to send money to family abroad cheaply?" The tables let you compare each pair slot by slot.

## What the code measured

For each model, the code checked 6 outputs and 72 questions. It reported:

- **Median words:** 10 for Claude Haiku 5.5 and Claude Sonnet 5.5, 11 for Claude Opus 5.5 and Claude Fable 5.1.
- **Over 16 words:** 0 for every model.
- **Names a studied brand:** 0 for every model. No question names Wise or another brand.
- **Joins two asks with "or":** 0 for every model.
- **Names a place:** 0 for every model. The questions say "abroad" or "overseas" and name no country.
- **Ends with a question mark:** 36% for Claude Haiku 5.5, 51% for Claude Sonnet 5.5, 50% for Claude Opus 5.5, 71% for Claude Fable 5.1.
- **Near-duplicate pairs:** 0 for every model.
- **Distinct openers:** 56% for Claude Haiku 5.5, 32% for Claude Sonnet 5.5, 40% for Claude Opus 5.5, 42% for Claude Fable 5.1.
- **Mean output tokens:** 2620 for Claude Haiku 5.5, 768 for Claude Sonnet 5.5, 1025 for Claude Opus 5.5, 804 for Claude Fable 5.1.

These are counts. They do not score whether a question is good.

## Every question, side by side

Run 1 of each setting. Each row is one planned slot; the model and the effort are the only things that change across a row and down a stage.

### International money transfer

| Stage         | Model      | Low effort                                                                       | Medium effort                                                             | High effort                                                              |
| ------------- | ---------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Awareness     | Haiku 5.5  | Best way to send money to family abroad cheaply?                                 | Looking for a cheap way to send money to family abroad                    | Cheapest way to send money to family overseas each month                 |
| Awareness     | Sonnet 5.5 | Best way to send money abroad to support my family                               | Best way to send money to my parents abroad regularly                     | Best way to send money abroad to support my family                       |
| Awareness     | Opus 5.5   | Cheapest way to send money to my parents overseas every month                    | Cheapest way to send money to my parents abroad every month               | Cheapest way to send money to my family abroad every month               |
| Awareness     | Fable 5.1  | Cheapest way to send money home to my family every month?                        | Cheapest way to send money to my parents overseas every month?            | Cheapest way to send money to family abroad every month?                 |
| Consideration | Haiku 5.5  | I'm an expat sending rent money home, which transfer service is best?            | Recommend a money transfer app for expats paying rent at home             | As an expat, which service is best for sending money home?               |
| Consideration | Sonnet 5.5 | I'm an expat, which money transfer service should I use?                         | I'm an expat, which money transfer service should I use?                  | I'm an expat, which money transfer service should I use?                 |
| Consideration | Opus 5.5   | I'm an expat, which money transfer service should I use to send money home?      | I'm an expat, which money transfer services do people actually recommend? | As an expat, what's the best service for sending money home?             |
| Consideration | Fable 5.1  | I'm an expat, which money transfer services work best for moving savings abroad? | I've just moved abroad, which transfer services do expats actually use?   | I've just moved abroad as an expat, which transfer service should I use? |
| Decision      | Haiku 5.5  | Compare international transfer services with clear upfront fees and locked rates | Compare international transfer services with upfront fee breakdowns       | Compare money transfer services that show all fees upfront               |
| Decision      | Sonnet 5.5 | Compare international money transfer services that show all fees upfront         | Compare international money transfer services that show all fees upfront  | Compare international transfer services that show fees upfront           |
| Decision      | Opus 5.5   | Compare international transfer services that show all fees before I send         | Compare money transfer apps that show all fees before I send              | Compare money transfer apps that show all fees upfront                   |
| Decision      | Fable 5.1  | Any international transfer providers that show the full fee before I send?       | Which money transfer apps show the full fee before I send?                | Which money transfer services show the full fee before you send?         |

### Multi-currency account

| Stage         | Model      | Low effort                                                                     | Medium effort                                                                           | High effort                                                                           |
| ------------- | ---------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Awareness     | Haiku 5.5  | How can I get paid by overseas clients without high conversion costs?          | Accounts that let me get paid by overseas clients                                       | Best account to receive client payments from overseas                                 |
| Awareness     | Sonnet 5.5 | Where can I open an account to get paid by overseas clients?                   | Looking for an account to get paid by overseas clients                                  | Where can I open an account to get paid by overseas clients?                          |
| Awareness     | Opus 5.5   | Best account for getting paid by clients in other currencies                   | Best account for receiving payments from overseas clients without big conversion losses | Looking for an account to receive payments from overseas clients                      |
| Awareness     | Fable 5.1  | What's a good account for getting paid by overseas clients?                    | I freelance for overseas clients, what account lets me receive their payments?          | Best account for getting paid by overseas clients in their currency                   |
| Consideration | Haiku 5.5  | I'm a remote worker, which multi-currency account suits my income?             | Best multi-currency account for remote workers with foreign salaries                    | Multi-currency account options for remote workers paid abroad                         |
| Consideration | Sonnet 5.5 | Recommend a multi-currency account for remote workers                          | Recommend a multi-currency account for remote workers                                   | Recommend a multi-currency account for remote workers                                 |
| Consideration | Opus 5.5   | I work remotely for foreign companies, what multi-currency account works best? | I work remotely for foreign companies, what multi-currency account should I open?       | I work remotely for foreign companies, which multi-currency account do you recommend? |
| Consideration | Fable 5.1  | I work remotely for foreign companies, recommend a multi-currency account      | Best multi-currency account for a remote worker paid in different currencies            | I work remotely for a foreign company, what multi-currency account should I open?     |
| Decision      | Haiku 5.5  | Multi-currency accounts holding over 40 currencies, which should I compare?    | Compare multi-currency accounts that hold more than 40 currencies                       | Where can I open a multi-currency account holding 40 currencies?                      |
| Decision      | Sonnet 5.5 | Which multi-currency accounts let you hold over 40 currencies?                 | Which multi-currency accounts let you hold the most currencies?                         | Which multi-currency accounts let you hold the most currencies?                       |
| Decision      | Opus 5.5   | Which multi-currency accounts let you hold the most currencies?                | Which multi-currency accounts let you hold dozens of currencies at once?                | Which multi-currency account lets me hold the widest range of currencies?             |
| Decision      | Fable 5.1  | Which multi-currency accounts let me hold the widest range of currencies?      | Compare multi-currency accounts that let me hold lots of different currencies           | Compare multi-currency accounts that let you hold dozens of currencies                |

### International debit card

| Stage         | Model      | Low effort                                                                  | Medium effort                                                                    | High effort                                                                   |
| ------------- | ---------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Awareness     | Haiku 5.5  | Best debit card for spending abroad while studying overseas?                | Looking for a debit card for students studying overseas                          | Debit card to avoid bank fees while studying overseas                         |
| Awareness     | Sonnet 5.5 | Looking for a debit card for studying overseas                              | What's a good debit card for studying abroad?                                    | Any good debit card for studying overseas?                                    |
| Awareness     | Opus 5.5   | Good debit card for a student studying abroad                               | Good debit card to use while studying abroad for a year                          | Best debit card to use while studying abroad                                  |
| Awareness     | Fable 5.1  | Looking for a debit card to use while studying overseas                     | Starting university abroad next year, what debit card should I get?              | Looking for a debit card to use while studying overseas                       |
| Consideration | Haiku 5.5  | I shop online in foreign currencies, any debit card without markups?        | Recommend a debit card for online shopping in foreign currencies                 | Any debit card good for shopping on foreign websites?                         |
| Consideration | Sonnet 5.5 | Best international debit card for online shopping in foreign currencies     | Any international debit card good for online shopping in foreign currencies?     | What's a good international debit card for online shopping?                   |
| Consideration | Opus 5.5   | Any debit cards that avoid foreign fees when shopping on overseas websites? | Any debit cards that avoid foreign transaction fees on overseas online shopping? | I shop a lot on overseas websites, any debit card without foreign fees?       |
| Consideration | Fable 5.1  | Best card for shopping on foreign websites without conversion fees          | Any debit card that avoids conversion fees when shopping on foreign websites?    | Any good debit card for shopping on foreign websites without conversion fees? |
| Decision      | Haiku 5.5  | Debit cards with free ATM withdrawal allowances abroad, which should I buy? | Compare travel debit cards with free monthly ATM withdrawals abroad              | Compare debit cards with free ATM withdrawals abroad                          |
| Decision      | Sonnet 5.5 | Any travel debit cards with a free ATM withdrawal allowance?                | Where can I get a travel debit card with free ATM withdrawals?                   | Compare travel debit cards with a free ATM withdrawal allowance               |
| Decision      | Opus 5.5   | Travel debit cards with free ATM withdrawals abroad, which one to get?      | Where can I get a travel debit card with free ATM withdrawals?                   | Who offers a travel debit card with free monthly ATM withdrawals?             |
| Decision      | Fable 5.1  | Where can I get a travel debit card with free ATM withdrawals abroad?       | Which travel debit cards include free ATM withdrawals abroad?                    | Which travel debit cards include free ATM withdrawals abroad?                 |

### International business account

| Stage         | Model      | Low effort                                                                                | Medium effort                                                                           | High effort                                                                           |
| ------------- | ---------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Awareness     | Haiku 5.5  | Expanding into new markets, what business account handles foreign currency payments?      | Business account for paying suppliers in new overseas markets                           | I need a business account for entering new overseas markets                           |
| Awareness     | Sonnet 5.5 | I need a business account for expanding into new markets                                  | Best business account for expanding into new markets                                    | Best business account for expanding into new markets                                  |
| Awareness     | Opus 5.5   | Looking for a business account to handle payments as we expand internationally            | Our company is expanding abroad, who offers good international business accounts?       | Recommend a business account for a company expanding into new markets                 |
| Awareness     | Fable 5.1  | We're expanding into new countries, what business account handles international payments? | We're expanding overseas, what business account handles foreign currency payments?      | Who offers a business account for a company expanding into new countries?             |
| Consideration | Haiku 5.5  | I'm a finance team lead, which international business account has batch payments?         | Recommend a multi-currency business account for finance teams                           | Best international business account for finance teams                                 |
| Consideration | Sonnet 5.5 | What's a good international business account for our finance team?                        | I run a finance team, which international business account suits us?                    | Looking for an international business account suited to finance teams                 |
| Consideration | Opus 5.5   | Recommend international business accounts that make life easier for finance teams         | Recommend international business accounts that make life easier for finance teams       | I lead a finance team, what's a good international business account for us?           |
| Consideration | Fable 5.1  | Our finance team needs a business account for paying suppliers in several currencies      | Recommend an international business account our finance team can run batch payouts from | Recommend an international business account our finance team can manage payments from |
| Decision      | Haiku 5.5  | Business accounts with API access for international payments, compare options             | Compare business accounts offering API access for payment automation                    | Compare international business accounts that offer API access                         |
| Decision      | Sonnet 5.5 | Who offers an international business account with API access?                             | Who offers an international business account with API access?                           | Who offers an international business account with API access?                         |
| Decision      | Opus 5.5   | Best international business accounts with a payments API for developers                   | Business accounts with an API for automating international payouts, compared            | Shortlist of international business accounts that offer API access                    |
| Decision      | Fable 5.1  | Who offers an international business account with API access for automating payments?     | Who offers a business account with an API for automating international payments?        | What's a good international business account with API access for automating payments? |

## What the code measured for Wise

All six outputs per model (three efforts, two runs), 72 questions each.

| Model      | Median words | Over 16 words | Ends with ? | Contains "or" | Names a studied brand | Near-duplicate pairs | Distinct openings | Output tokens per run |
| ---------- | ------------ | ------------- | ----------- | ------------- | --------------------- | -------------------- | ----------------- | --------------------- |
| Haiku 5.5  | 10           | 0%            | 36.1%       | 0%            | 0%                    | 0%                   | 55.6%             | 2620                  |
| Sonnet 5.5 | 10           | 0%            | 51.4%       | 0%            | 0%                    | 0%                   | 31.9%             | 768                   |
| Opus 5.5   | 11           | 0%            | 50%         | 0%            | 0%                    | 0%                   | 40.3%             | 1025                  |
| Fable 5.1  | 11           | 0%            | 70.8%       | 0%            | 0%                    | 0%                   | 41.7%             | 804                   |

## Frequently asked questions

### Why do so many questions have no question mark

The slots ask for short questions a buyer might type into an AI assistant. Some models write these as search-style phrases, such as requests that start with "Compare" or "Recommend". The share ending in a question mark ranges from 36% for Claude Haiku 5.5 to 71% for Claude Fable 5.1.

### Do any of the questions mention Wise or a competitor

No. The code found that 0 questions name a studied brand, for every model. The questions describe a need and leave the AI assistant to name the business.

### Does higher effort produce different questions

In places. The wording shifts between low, medium and high effort, but each model keeps its own habits across settings. Some questions repeat word for word across efforts and across runs. The tables show every output, so you can compare settings slot by slot.

### Why does Claude Haiku 5.5 use more output tokens

The code recorded a mean of 2620 output tokens for Claude Haiku 5.5. The other three models ranged from 768 to 1025. The questions themselves are about the same length, with a median of 10 words. This study did not examine what the extra tokens contained.
