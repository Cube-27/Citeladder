---
title: 'Buyer questions for Duolingo, drafted by four Claude models'
slug: '/buyer-prompts/duolingo'
meta_title: 'Buyer questions for Duolingo from four Claude models'
meta_description: 'The same CiteLadder Prompt Builder step, run on four Claude models at three effort levels, twice each, for Duolingo. What the questions look like and what the code measured.'
primary_keyword: 'Duolingo buyer prompts'
secondary_keywords:
  ['language learning app prompts', 'AI visibility prompts', 'buyer questions for AI search']
search_intent: 'See the buyer questions four Claude models draft for Duolingo and compare them'
content_type: 'model comparison page'
related_guides: ['/research/prompt-builder-model-comparison-2026', '/buyer-prompts/wise']
index_group: 'Consumer brands'
index_meta: 'language learning app'
reviewed_at: '2026-11-07'
published_at: '2026-11-07'
author: 'Abhineet Jain'
product:
  heading: 'Track your own buyer questions'
  href: '/platform/ai-visibility'
  body: 'CiteLadder tracks how ChatGPT, Gemini, Claude, Google AI Overviews and Google AI Mode answer the buyer questions for your brand, recording mentions, position, sentiment and competitors. Every result is tied to the recorded answer, so you can see exactly what each AI said.'
---

CiteLadder's Prompt Builder drafts the buyer questions a brand tracks in AI answers. For this study we gave it one business profile for Duolingo and 12 planned question slots. We ran it on Claude Haiku 5.5, Claude Sonnet 5.5, Claude Opus 5.5 and Claude Fable 5.1, at low, medium and high effort, twice each. The instructions stayed the same. Only the model and the effort changed. The tables below show every question each model wrote. This page describes what can be observed in those questions and what the code measured. Judging quality is left to the reader.

## What Duolingo sells, per the business profile

The business profile files Duolingo under the category "language learning app". It lists the business model as a direct-to-consumer product and the buyer type as both consumers and organisations. Its category terms include "gamified language learning", "online English proficiency test" and "mobile learning app".

The profile describes 4 offerings. Each one became a topic for the question slots:

- **Free language learning app**: short, game-like lessons on web and mobile in many languages.
- **Premium language learning subscription**: a paid tier that removes ads and adds unlimited mistakes, personalized review and AI conversation practice.
- **Online English proficiency test**: an English test taken at home on a computer, with fast results that institutions accept for admissions.
- **Math and music learning lessons**: gamified lessons in the same app for basic math and for reading and playing music.

Each offering also carries attributes, situations and audiences. The slot plan draws on these.

## How the 12 slots were planned

Each topic got three slots. Each slot pairs a buyer stage with one facet from the profile:

- **Slot 1, awareness, with a situation.** Free app: "Learning before travel". Premium: "Frustrated by ads". English test: "No nearby test center". Math and music: "Supplementing schoolwork".
- **Slot 2, consideration, with an audience.** Free app: "Adult self-learners". Premium: "Families". English test: "University admissions offices". Math and music: "Teachers".
- **Slot 3, decision, with an attribute.** Free app: "Free to use". Premium: "Unlimited mistakes". English test: "Low test fee". Math and music: "Progress tracking".

The allowed intents depend on the stage. Awareness slots allow learn, solve and recommend. Consideration slots allow solve, recommend, compare and validate. Decision slots allow compare, validate, buy and recommend. All 12 slots belong to the core cohort.

## What is visibly different between the models

**Length.** The median question is 9 words for Claude Haiku 5.5, 10 for Claude Sonnet 5.5, 11 for Claude Opus 5.5 and 12 for Claude Fable 5.1. No model wrote a question over 16 words.

**Question marks and form.** The share of questions ending in a question mark is 18.1% for Claude Haiku 5.5, 38.9% for Claude Sonnet 5.5, 43.1% for Claude Opus 5.5 and 55.6% for Claude Fable 5.1. Claude Haiku 5.5 mostly writes statements in the form of a search query. They often open with "Best", "Compare", "Recommend" or "Looking for", as in "Compare math learning apps offering progress tracking dashboards".

**First-person framing.** Claude Sonnet 5.5 opens slot t4s2 with "I'm a teacher," in all six outputs, for example "I'm a teacher, what gamified math app suits my classroom?". For slot t3s2, the admissions office audience, Claude Opus 5.5 and Claude Fable 5.1 mostly write from the office's side, as in "We run university admissions, what online English tests should we accept?". Claude Haiku 5.5 and Claude Sonnet 5.5 write that slot as a question about which tests universities accept.

**How specific.** All four models name languages. Claude Haiku 5.5 uses Spanish and Japanese. Claude Sonnet 5.5 uses Spanish and Italian. Claude Opus 5.5 uses Spanish and French. Claude Fable 5.1 uses Spanish, Italian and French. Time details such as "next month" appear in Claude Opus 5.5 and Claude Fable 5.1. Claude Haiku 5.5 is the only model with a non-zero place score, and one of its questions names a country: "Online English tests universities in the UK accept for admissions".

**Rewording the profile.** For the "Unlimited mistakes" slot, Claude Haiku 5.5 and Claude Sonnet 5.5 mostly keep that phrase. Claude Opus 5.5 and Claude Fable 5.1 more often describe the effect, such as being locked out of lessons. One example: "Paid language app that lets me keep going after mistakes without losing lives".

## Effort levels and repeat runs

The code reports one set of numbers per model, across all six of its outputs. It does not report numbers per effort level. The notes below come from reading the questions.

**Claude Haiku 5.5.** At low effort, run 1 and run 2 share some questions word for word. Slot t1s1 is "Best free app to learn some Spanish before my trip" in both. No low-effort question opens with "Compare". At medium and high effort, "Compare" opens several questions in each output. High effort run 1 opens three questions with "Looking for".

**Claude Sonnet 5.5.** Wording stays close across all three effort levels. "Who offers an English proficiency test I can take at home?" appears in medium run 1, medium run 2 and high run 1. The two medium runs share several questions exactly.

**Claude Opus 5.5.** The two medium runs share several questions exactly, including slots t1s1, t2s3, t3s1 and t3s3. One t3s1 wording that opens with "No test center near me" appears in low run 2 and in both medium runs. At high effort, slot t1s1 shifts from Spanish to "basic phrases before a trip abroad".

**Claude Fable 5.1.** The same t1s1 question appears in low run 1, low run 2 and medium run 2. High effort run 1 ends most of its questions with a question mark, including phrases that are not full sentences, such as "Free app to pick up some Italian before my trip next month?". High effort run 2 ends fewer questions with one.

## What the code measured

Each model produced 6 outputs and 72 questions. The code checked every question for the following:

- **Median words:** 9 for Claude Haiku 5.5, 10 for Claude Sonnet 5.5, 11 for Claude Opus 5.5, 12 for Claude Fable 5.1.
- **Over 16 words:** 0% for all four models.
- **Names a studied brand:** 0% for all four models.
- **Joins two asks with "or":** 0% for all four models.
- **Names a place:** 1.4% for Claude Haiku 5.5, 0% for the other three.
- **Ends with a question mark:** 18.1%, 38.9%, 43.1% and 55.6%, in the same model order.
- **Near-duplicate pairs:** 0% for all four models.
- **Distinct openers:** 56.9% for Claude Haiku 5.5, 40.3% for Claude Sonnet 5.5, 44.4% for Claude Opus 5.5, 47.2% for Claude Fable 5.1.
- **Mean output tokens:** 2568 for Claude Haiku 5.5, 776 for Claude Sonnet 5.5, 1098 for Claude Opus 5.5, 1139 for Claude Fable 5.1.

These numbers describe form. They do not score quality.

## Every question, side by side

Run 1 of each setting. Each row is one planned slot; the model and the effort are the only things that change across a row and down a stage.

### Free language learning app

| Stage         | Model      | Low effort                                                           | Medium effort                                                          | High effort                                                          |
| ------------- | ---------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Awareness     | Haiku 5.5  | Best free app to learn some Spanish before my trip                   | Best free app to learn Spanish before a trip abroad                    | Looking for free apps to learn basic phrases before a trip           |
| Awareness     | Sonnet 5.5 | Best free app to learn Spanish before my trip                        | Best free app to pick up basic Spanish before a trip                   | Best free app to learn basic Spanish before a trip                   |
| Awareness     | Opus 5.5   | Free app to learn some Spanish before my trip next month             | Free app to learn basic Spanish before my trip next month              | Free app to pick up basic phrases before a trip abroad               |
| Awareness     | Fable 5.1  | Looking for a free app to pick up basic Spanish before my trip       | Looking for a free app to pick up some Italian before my trip          | Free app to pick up some Italian before my trip next month?          |
| Consideration | Haiku 5.5  | Which free language app suits adults teaching themselves Japanese?   | Compare free self-study language apps for adult beginners              | What's a good free language app for adult self-learners?             |
| Consideration | Sonnet 5.5 | I'm an adult teaching myself a language, which free app works?       | I'm an adult learning on my own, which language app works?             | I'm an adult teaching myself a language, which free app works?       |
| Consideration | Opus 5.5   | I'm an adult learning French alone, which free app works best?       | Best free language apps for adults learning on their own               | I'm an adult teaching myself a language, what free app works best?   |
| Consideration | Fable 5.1  | I'm an adult learning Italian on my own, which free app works best?  | What's a good free language app for adults learning on their own?      | I'm an adult teaching myself French, what free app actually works?   |
| Decision      | Haiku 5.5  | Any completely free language apps that actually work without paying? | Any fully free language app with no subscription needed                | Compare free language apps that never charge for lessons             |
| Decision      | Sonnet 5.5 | Compare completely free language learning apps with no paywall       | Any language learning apps that are completely free to use?            | Compare completely free language apps with no paywall on lessons     |
| Decision      | Opus 5.5   | Language apps that are actually free, not just a trial               | Which language learning apps are actually completely free, no paywall? | Compare language apps that are genuinely free, not just a free trial |
| Decision      | Fable 5.1  | Which language apps are actually free without constant paywalls?     | Which language apps are actually free without hidden paywalls?         | Best language learning app that is genuinely free with no paywall?   |

### Premium language learning subscription

| Stage         | Model      | Low effort                                                                 | Medium effort                                                           | High effort                                                                 |
| ------------- | ---------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Awareness     | Haiku 5.5  | Language app alternatives without annoying ads between lessons             | Ad-free language app that's worth paying for                            | Looking for an ad-free language app without constant interruptions          |
| Awareness     | Sonnet 5.5 | Language learning app subscription that removes ads                        | Alternative to language apps that keep interrupting lessons with ads    | Alternative to language apps with constant ads between lessons              |
| Awareness     | Opus 5.5   | Alternative to language apps with constant ads interrupting lessons        | Tired of constant ads in my language app, any ad-free alternatives?     | Looking for an ad-free language learning subscription, sick of constant ads |
| Awareness     | Fable 5.1  | Sick of ads interrupting my lessons, any paid language app worth it?       | I need a language app without ads interrupting every lesson             | Paid language app that gets rid of the ads between lessons?                 |
| Consideration | Haiku 5.5  | Family language learning subscription for kids and parents together        | Best paid language app plans for families sharing access                | Best premium language app subscription for a family                         |
| Consideration | Sonnet 5.5 | Best language app subscription with a family plan                          | Recommend a paid language learning subscription with a family plan      | Language learning subscription with a family plan for kids and parents      |
| Consideration | Opus 5.5   | Best language app subscription with a family plan                          | Language learning subscription with a family plan for four people       | Best language learning subscription with a family plan                      |
| Consideration | Fable 5.1  | Best language app subscription with a family plan for several learners     | Any language learning subscription with a family plan we can share?     | Looking for a language app subscription our whole family can share          |
| Decision      | Haiku 5.5  | Language subscriptions that allow unlimited mistakes during practice       | Recommend a language subscription that doesn't cap mistakes in lessons  | Which premium language plans offer unlimited mistakes?                      |
| Decision      | Sonnet 5.5 | Where can I buy a language app plan with unlimited mistakes?               | Where can I subscribe to a language app with unlimited mistakes?        | Where can I buy a language app subscription with unlimited mistakes?        |
| Decision      | Opus 5.5   | Paid language app where mistakes don't lock you out of lessons             | Paid language app plans that don't limit how many mistakes you make     | Where can I buy a language app plan with unlimited mistakes?                |
| Decision      | Fable 5.1  | Language app subscription that doesn't lock me out after too many mistakes | Best paid language app that doesn't lock me out after too many mistakes | Premium language app where mistakes don't lock me out of lessons?           |

### Online English proficiency test

| Stage         | Model      | Low effort                                                                | Medium effort                                                                      | High effort                                                                   |
| ------------- | ---------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Awareness     | Haiku 5.5  | Where can I take an English proficiency test at home online?              | Taking an English proficiency test from home with no test center nearby            | Where can I take an online English proficiency test from home?                |
| Awareness     | Sonnet 5.5 | Any English proficiency test I can take online from home?                 | Who offers an English proficiency test I can take at home?                         | Who offers an English proficiency test I can take at home?                    |
| Awareness     | Opus 5.5   | No test center near me, which English test can I take at home?            | No test center near me, where can I take an English test online?                   | Need an English proficiency test I can take from home, no test center nearby  |
| Awareness     | Fable 5.1  | I have no test center nearby, which English tests can I take at home?     | Where can I take an English proficiency test from home with no test center nearby? | English proficiency test I can take at home, no test center nearby            |
| Consideration | Haiku 5.5  | Online English tests universities in the UK accept for admissions         | Compare online English tests universities accept for admissions                    | Recommend an online English test universities accept for admission            |
| Consideration | Sonnet 5.5 | Online English tests that university admissions offices accept            | Online English tests that university admissions offices accept                     | Online English tests that university admissions offices accept for applicants |
| Consideration | Opus 5.5   | We run university admissions, what online English tests should we accept? | I work in university admissions, which at-home English tests should we accept?     | I work in university admissions, which online English tests should we accept? |
| Consideration | Fable 5.1  | Which online English tests do universities accept for admissions?         | I work in university admissions, which online English tests should we accept?      | I work in university admissions, what at-home English tests should we accept? |
| Decision      | Haiku 5.5  | Cheapest online English proficiency test with fast results                | Where can I book a cheap online English proficiency test                           | Where to buy a low-cost online English proficiency test                       |
| Decision      | Sonnet 5.5 | Cheapest online English proficiency test for university applications      | Cheapest online English proficiency test for university applications               | Cheapest online English proficiency test to compare for applications          |
| Decision      | Opus 5.5   | Cheapest online English proficiency test accepted by universities         | Cheapest online English proficiency test that universities accept                  | Cheapest English proficiency test I can take online                           |
| Decision      | Fable 5.1  | Cheapest online English proficiency test accepted by colleges             | Cheapest online English test that universities accept for applications             | Cheapest online English test that universities actually accept?               |

### Math and music learning lessons

| Stage         | Model      | Low effort                                                                   | Medium effort                                                        | High effort                                                                        |
| ------------- | ---------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Awareness     | Haiku 5.5  | Fun app to help my child catch up on times tables                            | Fun app to supplement my kid's schoolwork in math                    | Looking for fun math practice apps to support schoolwork                           |
| Awareness     | Sonnet 5.5 | Apps with math and music lessons to help with schoolwork                     | Good app with math and music lessons to support schoolwork           | Looking for a fun app for math lessons to support schoolwork                       |
| Awareness     | Opus 5.5   | Fun apps for extra math practice alongside school                            | Fun apps to help my kid practice math after school                   | Fun math lessons app to supplement my kid's schoolwork                             |
| Awareness     | Fable 5.1  | Any fun math app to help my kid keep up with schoolwork?                     | Recommend a fun math practice app to supplement my kid's schoolwork  | Fun math app to back up what my daughter learns at school                          |
| Consideration | Haiku 5.5  | I teach a primary class, which music reading app should I use?               | Music reading apps teachers can use alongside classroom lessons      | Music reading app for classroom teachers, any good options?                        |
| Consideration | Sonnet 5.5 | I'm a teacher, what gamified math app suits my classroom?                    | I'm a teacher, what gamified math app suits my classroom?            | I'm a teacher, what app has gamified music lessons for my class?                   |
| Consideration | Opus 5.5   | I'm a teacher, any gamified math lessons for my class?                       | I'm a teacher, recommend gamified music lessons for my classroom     | I teach music, any gamified apps for teaching kids to read notes?                  |
| Consideration | Fable 5.1  | I teach primary school, which game-based music lessons could I use in class? | I teach primary school, any gamified music lessons app for my class? | I teach elementary music, any gamified app for students to practice reading notes? |
| Decision      | Haiku 5.5  | Math and music learning apps with detailed progress tracking                 | Compare math learning apps offering progress tracking dashboards     | Compare music reading apps that track learning progress                            |
| Decision      | Sonnet 5.5 | Compare music learning apps that include progress tracking                   | Compare learning apps for music and math with progress tracking      | Math learning apps that show progress tracking, ranked                             |
| Decision      | Opus 5.5   | Music learning apps that track progress over time                            | Compare math learning apps that track progress over time             | Best music lessons app that tracks my progress                                     |
| Decision      | Fable 5.1  | Recommend a math practice app that tracks my child's progress                | Best math learning app that tracks progress over time                | Best math practice app that tracks my kid's progress over time?                    |

## What the code measured for Duolingo

All six outputs per model (three efforts, two runs), 72 questions each.

| Model      | Median words | Over 16 words | Ends with ? | Contains "or" | Names a studied brand | Near-duplicate pairs | Distinct openings | Output tokens per run |
| ---------- | ------------ | ------------- | ----------- | ------------- | --------------------- | -------------------- | ----------------- | --------------------- |
| Haiku 5.5  | 9            | 0%            | 18.1%       | 0%            | 0%                    | 0%                   | 56.9%             | 2568                  |
| Sonnet 5.5 | 10           | 0%            | 38.9%       | 0%            | 0%                    | 0%                   | 40.3%             | 776                   |
| Opus 5.5   | 11           | 0%            | 43.1%       | 0%            | 0%                    | 0%                   | 44.4%             | 1098                  |
| Fable 5.1  | 12           | 0%            | 55.6%       | 0%            | 0%                    | 0%                   | 47.2%             | 1139                  |

## Frequently asked questions

### Did any question mention Duolingo by name?

No. The code found that 0% of questions from every model named a studied brand. The slots ask for questions a buyer might put to an AI assistant, which the assistant can answer by naming a business.

### Why do some questions repeat between run 1 and run 2?

Each setting ran twice with the same profile, slots and instructions. Some models returned identical questions for a slot in both runs, mostly at low and medium effort. The tables below show every question, so you can compare the runs side by side.

### Does this page say which model to use for building a prompt list?

No. The page describes length, wording, openings, framing and the code's measurements. Judging which questions fit your tracking needs is left to you.

### How many questions does each model have in the tables?

Each model has 72 questions from 6 outputs: low, medium and high effort, two runs each, with 12 slots per output.
