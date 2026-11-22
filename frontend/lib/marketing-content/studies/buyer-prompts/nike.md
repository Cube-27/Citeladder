---
title: 'Buyer questions for Nike, drafted by four Claude models'
slug: '/buyer-prompts/nike'
meta_title: 'Buyer questions for Nike, drafted by four Claude models'
meta_description: 'The same 12 Nike buyer-question slots, drafted by four Claude models at low, medium and high effort, twice each. Wording, openings and code measurements.'
primary_keyword: 'Nike buyer prompts'
secondary_keywords:
  [
    'athletic footwear and apparel prompts',
    'AI visibility prompts',
    'buyer questions for AI search',
  ]
search_intent: 'See the buyer questions four Claude models draft for Nike and compare them'
content_type: 'model comparison page'
related_guides: ['/research/prompt-builder-model-comparison-2026', '/buyer-prompts/wise']
index_group: 'Consumer brands'
index_meta: 'athletic footwear and apparel'
reviewed_at: '2026-11-07'
published_at: '2026-11-07'
author: 'Abhineet Jain'
product:
  heading: 'Track your own buyer questions in AI'
  href: '/platform/ai-visibility'
  body: 'CiteLadder tracks how ChatGPT, Gemini, Claude, Google AI Overviews and Google AI Mode answer the buyer questions for your brand, recording mentions, position, sentiment and competitors. Every result is tied to the recorded answer, so you can read exactly what each model said.'
---

CiteLadder's Prompt Builder drafts the buyer questions a brand tracks in AI answers. For this study, the same step ran on Claude Haiku 5.5, Claude Sonnet 5.5, Claude Opus 5.5 and Claude Fable 5.1. Each model got the same instructions, the same Nike business profile and the same 12 planned slots. Each ran at low, medium and high effort, twice per setting. Only the model and the effort changed. The tables below show every question each model wrote. This page describes what can be observed and measured. Judging quality is left to the reader.

## What the business profile says Nike sells

The business profile files Nike under athletic footwear and apparel. The business model is a direct-to-consumer product business, and the buyers are consumers. The category terms are athletic shoes, sportswear, running shoes, basketball shoes, sneakers, activewear, training apparel and soccer cleats.

The profile lists four offerings. Each one became a topic:

- **Running shoes**: road and trail footwear, from daily trainers to max-cushion and carbon-plated race shoes.
- **Basketball and court shoes**: basketball and tennis footwear, including signature-athlete models and retro high-tops.
- **Lifestyle sneakers**: casual sneakers based on classic sport silhouettes, with many colorways and custom designs.
- **Training and performance apparel**: sports bras, leggings, shorts, tops, fleece hoodies and weather-ready jackets.

Soccer cleats appear in the category terms but not as an offering, so no topic covers them. Each offering carries its own attributes, situations and audiences. The slot plan draws on those.

## How the 12 slots were planned

Each topic got three slots, and every topic follows the same pattern:

- **Slot 1** targets the awareness stage and is built around a situation. Allowed intents: learn, solve, recommend.
- **Slot 2** targets the consideration stage and is built around an audience. Allowed intents: solve, recommend, compare, validate.
- **Slot 3** targets the decision stage and is built around an attribute. Allowed intents: compare, validate, buy, recommend.

The facet for each slot, in stage order:

- **Running shoes**: marathon race preparation, road runners, maximum cushioning.
- **Basketball and court shoes**: limited-edition release drops, tennis players, court traction pattern.
- **Lifestyle sneakers**: holiday gift giving, parents buying for kids, custom design options.
- **Training and performance apparel**: gym strength sessions, women athletes, sports bra support level.

All slots sit in the core cohort. Each model produced 6 outputs from this plan, for 72 questions per model.

## What is visibly different between the models

**Length.** The median question is 9 words for Claude Haiku 5.5 and Claude Sonnet 5.5, and 10 words for Claude Opus 5.5 and Claude Fable 5.1. No model wrote a question over 16 words.

**Openings.** Claude Haiku 5.5 often opens with the intent itself: "Compare", "Recommend" or "Best". It also tends to reuse profile wording, as in "Compare basketball shoes with herringbone traction patterns for indoor courts". Claude Sonnet 5.5 settles on a few openers and keeps them, such as "Best running shoes for marathon training and race day".

**First-person framing.** All four models write some questions as a buyer describing themselves. Claude Sonnet 5.5 does this in a fixed form for the parents slot: "I'm a parent, what casual sneakers hold up for active kids?" Claude Opus 5.5 and Claude Fable 5.1 often add a habit or a setting, such as playing tennis twice a week or running mostly on pavement.

**Framing as a problem.** Claude Opus 5.5 sometimes starts from something that went wrong, for example "Alternative to leggings that go see-through during squats, for women athletes". It also adds physical detail, as in "Basketball shoes with the grippiest traction for dusty indoor courts". Claude Fable 5.1 shares much of this wording. Both models wrote "Who lets you design your own custom sneakers online?"

**Question marks.** Claude Fable 5.1 ends 62.5% of its questions with a question mark, the largest share here. Some of these are search-style phrases with a question mark added: "Best running shoes to train in while preparing for a marathon?" It also wrote one comparison with "vs": "Daily trainer vs tempo shoe for a road runner, which should I buy?"

**Specificity.** No question from any model names Nike, another studied brand or a place. The specific detail comes from use cases, body types, surfaces and ages.

## Effort levels and repeat runs

Claude Sonnet 5.5 changes little across settings. Its low effort run 1 and run 2 are close to identical. Its marathon question repeats at low, medium and high effort. Where it does change, the change is often a single word, such as grip or traction, roads or pavement.

Claude Opus 5.5 is also steady on some slots. Its custom sneaker question appears at every effort level. Other slots shift more, for example the tennis and women athletes slots.

Claude Haiku 5.5 rewords most slots between run 1 and run 2, even at the same setting. A few phrases still recur, such as herringbone traction for the court traction slot.

Claude Fable 5.1 keeps much of its wording across low and medium effort. Its high effort run 2 differs from its other outputs in several slots, including the marathon and road runner slots.

Across these outputs, moving from low to high effort shows no single direction in length or framing. For several slots, run 1 and run 2 at one setting differ about as much as different effort levels do. The output token figures below are per model, not per effort level.

## What the code measured

The code checked all 72 questions from each model:

- **Median words**: 9 for Claude Haiku 5.5 and Claude Sonnet 5.5, 10 for Claude Opus 5.5 and Claude Fable 5.1.
- **Over 16 words**: 0% for every model.
- **Names a studied brand**: 0% for every model.
- **Joins two asks with "or"**: 0% for every model.
- **Names a place**: 0% for every model.
- **Ends with a question mark**: 37.5% for Claude Haiku 5.5, 50% for Claude Sonnet 5.5, 47.2% for Claude Opus 5.5, 62.5% for Claude Fable 5.1.
- **Near-duplicate pairs**: 0% for every model.
- **Distinct openers**: 58.3% for Claude Haiku 5.5, 31.9% for Claude Sonnet 5.5, 37.5% for Claude Opus 5.5, 40.3% for Claude Fable 5.1.
- **Mean output tokens**: 2417 for Claude Haiku 5.5, 780 for Claude Sonnet 5.5, 798 for Claude Opus 5.5, 802 for Claude Fable 5.1.

Identical questions do repeat across separate runs in the tables. The near-duplicate figure does not reflect those repeats, which suggests it looks at pairs within a single output.

## Every question, side by side

Run 1 of each setting. Each row is one planned slot; the model and the effort are the only things that change across a row and down a stage.

### Running shoes

| Stage         | Model      | Low effort                                                       | Medium effort                                                           | High effort                                                       |
| ------------- | ---------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Awareness     | Haiku 5.5  | Best running shoes for a first marathon build-up                 | Best running shoes to prepare for a marathon                            | Best running shoes to train for my first marathon                 |
| Awareness     | Sonnet 5.5 | Best running shoes for marathon training and race day            | Best running shoes for marathon training and race day                   | Best running shoes for marathon training and race day             |
| Awareness     | Opus 5.5   | Best running shoes for training for my first marathon            | Best running shoes for training for my first marathon                   | Best running shoes for training for my first marathon             |
| Awareness     | Fable 5.1  | Best running shoes for training towards my first marathon        | Best running shoes to train in while preparing for my first marathon    | Best running shoes for training for my first marathon             |
| Consideration | Haiku 5.5  | Recommend running shoes for road runners training through winter | I run road miles daily, which running shoes should I shortlist?         | Looking for a road running shoe that handles daily pavement miles |
| Consideration | Sonnet 5.5 | I run mostly on roads, which running shoes should I get?         | I run mostly on roads, which daily trainers are worth buying?           | I run mostly on pavement, which daily trainers do you recommend?  |
| Consideration | Opus 5.5   | I run mostly on pavement, which daily trainers hold up best?     | I run mostly on roads, which daily trainers hold up to high mileage?    | I mostly run on pavement, which shoes hold up best?               |
| Consideration | Fable 5.1  | I run mostly on pavement, which daily trainers hold up best?     | Which running shoes hold up best for road runners logging high mileage? | I run on pavement every day, what shoes hold up best?             |
| Decision      | Haiku 5.5  | Compare maximum cushion running shoes for long easy runs         | Compare max cushion running shoes for long runs                         | Compare maximum cushion running shoes for long runs               |
| Decision      | Sonnet 5.5 | Compare the most cushioned running shoes available right now     | Compare max cushion running shoes for long, soft miles                  | Compare the most cushioned running shoes available right now      |
| Decision      | Opus 5.5   | Where can I buy the most cushioned running shoes right now?      | Compare the most cushioned running shoes for long easy runs             | Compare the most cushioned running shoes for long easy miles      |
| Decision      | Fable 5.1  | Where can I buy max cushion running shoes for long easy runs?    | Where can I buy max cushion running shoes for easy recovery runs?       | Where can I buy max cushion running shoes for long runs?          |

### Basketball and court shoes

| Stage         | Model      | Low effort                                                                    | Medium effort                                                                | High effort                                                          |
| ------------- | ---------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Awareness     | Haiku 5.5  | Where do limited-edition basketball shoe drops usually get announced?         | Where can I track limited edition basketball shoe drops?                     | Where can I find limited-edition basketball shoe release drops?      |
| Awareness     | Sonnet 5.5 | Where can I find limited-edition basketball sneaker releases?                 | Where can I find limited-edition basketball sneaker releases?                | Where can I find limited-edition basketball sneaker releases?        |
| Awareness     | Opus 5.5   | How do I actually get limited-edition basketball shoe releases?               | Where can I actually get limited-edition basketball sneakers on release day? | Where can I actually get limited-edition basketball shoe drops?      |
| Awareness     | Fable 5.1  | Any limited-edition basketball shoe drops worth trying to grab?               | Any upcoming limited edition basketball shoe drops worth getting?            | Any upcoming limited edition basketball shoe drops worth getting?    |
| Consideration | Haiku 5.5  | Recommend court shoes for tennis players who slide a lot                      | Recommend court shoes for a competitive tennis player                        | I play tennis on hard courts, which court shoes are best?            |
| Consideration | Sonnet 5.5 | I play tennis twice a week, recommend some court shoes                        | I play tennis twice a week, recommend durable court shoes                    | I play tennis twice a week, recommend some durable court shoes       |
| Consideration | Opus 5.5   | I play tennis twice a week, what court shoes should I get?                    | Looking for tennis shoes that don't wear out fast on hard courts             | Good court shoes for a club tennis player with quick footwork        |
| Consideration | Fable 5.1  | I play tennis twice a week, what court shoes should I consider?               | I play tennis twice a week, what court shoes should I get?                   | Who makes good court shoes for tennis players?                       |
| Decision      | Haiku 5.5  | Compare basketball shoes with herringbone traction patterns for indoor courts | Compare basketball shoes with herringbone traction for indoor courts         | Compare basketball shoes with herringbone traction patterns          |
| Decision      | Sonnet 5.5 | Basketball shoes with the best grip on indoor courts                          | Basketball shoes with the best traction for indoor courts                    | Basketball shoes with the best grip on indoor courts                 |
| Decision      | Opus 5.5   | Basketball shoes with the grippiest outsole for dusty indoor courts           | Basketball shoes with the grippiest traction for dusty indoor courts         | Basketball shoes with the grippiest traction for dusty indoor courts |
| Decision      | Fable 5.1  | Which basketball shoes grip best on dusty indoor courts?                      | Basketball shoes with the grippiest traction on dusty indoor courts          | Which basketball shoes have the grippiest traction on dusty courts?  |

### Lifestyle sneakers

| Stage         | Model      | Low effort                                                              | Medium effort                                                      | High effort                                                                |
| ------------- | ---------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Awareness     | Haiku 5.5  | Looking for sneakers to gift someone during the holidays                | What sneakers make a good holiday gift this year?                  | What's a good sneaker gift for the holidays?                               |
| Awareness     | Sonnet 5.5 | Any good sneaker ideas for a holiday gift?                              | Any good sneaker ideas for a holiday gift?                         | Any good sneaker ideas for a holiday gift?                                 |
| Awareness     | Opus 5.5   | Looking for classic sneakers to give as a holiday gift                  | Any classic sneakers that make a good holiday gift?                | Looking for stylish everyday sneakers to give as a holiday gift            |
| Awareness     | Fable 5.1  | Looking for classic sneakers that make a good holiday gift              | Looking for casual sneakers to give as a holiday gift              | Looking for casual sneakers to give as a holiday gift                      |
| Consideration | Haiku 5.5  | Any comfortable lace-up sneakers for kids who run around at school?     | My son needs everyday sneakers, which brands should I compare?     | I'm buying everyday sneakers for my kids, what brands are good?            |
| Consideration | Sonnet 5.5 | I'm a parent, what are durable casual sneakers for my kid?              | I'm a parent, what casual sneakers hold up for kids?               | I'm a parent, what casual sneakers hold up for active kids?                |
| Consideration | Opus 5.5   | Durable everyday sneakers for kids that survive the playground          | Durable everyday sneakers for kids who outgrow shoes fast          | What casual sneakers do parents recommend for kids who outgrow shoes fast? |
| Consideration | Fable 5.1  | What's a good everyday sneaker for my kid who wears through shoes fast? | Durable everyday sneakers for my kids that survive the school year | Recommend everyday sneakers for my kids that won't fall apart              |
| Decision      | Haiku 5.5  | Where can I buy customizable lifestyle sneakers with my own design?     | Where can I buy custom-designed lifestyle sneakers online?         | Where can I order custom-designed sneakers with my own colorway?           |
| Decision      | Sonnet 5.5 | Where can I buy sneakers I can design myself?                           | Where can I buy sneakers I can customize myself?                   | Where can I buy sneakers I can customize myself?                           |
| Decision      | Opus 5.5   | Who lets you design your own custom sneakers online?                    | Who lets you design your own custom sneakers online?               | Who lets you design your own custom sneakers online?                       |
| Decision      | Fable 5.1  | Who lets you design your own custom sneakers online?                    | Who sells sneakers I can design with my own colors?                | Where can I design my own custom sneakers online?                          |

### Training and performance apparel

| Stage         | Model      | Low effort                                                                    | Medium effort                                                       | High effort                                                                     |
| ------------- | ---------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Awareness     | Haiku 5.5  | Best workout clothes for heavy gym strength sessions                          | Best workout clothes for heavy gym strength training                | Any workout clothing good for heavy gym strength sessions?                      |
| Awareness     | Sonnet 5.5 | What's a good workout outfit for lifting weights at the gym?                  | What's a good workout clothing brand for lifting at the gym?        | What's a good workout outfit for heavy lifting sessions at the gym?             |
| Awareness     | Opus 5.5   | What's a good workout outfit for heavy lifting at the gym?                    | What's a good gym outfit for heavy lifting sessions?                | Recommend workout clothes that don't restrict squats and deadlifts              |
| Awareness     | Fable 5.1  | Recommend workout clothes that don't ride up during heavy lifting sessions    | What's good workout clothing for heavy lifting sessions at the gym? | What's a good workout outfit for heavy lifting at the gym?                      |
| Consideration | Haiku 5.5  | I'm a woman lifting weights, which training apparel brands fit well?          | Which training apparel brands fit women lifters best?               | I'm a woman training for strength, what activewear should I try?                |
| Consideration | Sonnet 5.5 | Recommend performance workout clothing brands for women athletes              | Recommend training apparel brands for female athletes               | Recommend training clothes brands for women athletes                            |
| Consideration | Opus 5.5   | Alternative to leggings that go see-through during squats, for women athletes | Recommend women's training leggings that stay put during sprints    | Alternative to leggings that go see-through during workouts, for women athletes |
| Consideration | Fable 5.1  | Best training apparel brands for women who compete in sport                   | Recommend training gear brands made for women who compete seriously | I need training gear made for women who compete seriously                       |
| Decision      | Haiku 5.5  | Compare high-support sports bras for heavy lifting workouts                   | Looking for high-impact sports bras with maximum support            | Compare high-support sports bras side by side                                   |
| Decision      | Sonnet 5.5 | Where to buy high-support sports bras for running?                            | Compare high-support sports bras for running                        | Best high-support sports bras for running, compared                             |
| Decision      | Opus 5.5   | Best high-support sports bras for running                                     | Best high-support sports bras for running with a larger chest       | Best high-support sports bras for running                                       |
| Decision      | Fable 5.1  | Alternative to my sports bra that doesn't give enough support for sprints     | Best high support sports bra for running that actually stays put    | Best high support sports bra for running and jumping                            |

## What the code measured for Nike

All six outputs per model (three efforts, two runs), 72 questions each.

| Model      | Median words | Over 16 words | Ends with ? | Contains "or" | Names a studied brand | Near-duplicate pairs | Distinct openings | Output tokens per run |
| ---------- | ------------ | ------------- | ----------- | ------------- | --------------------- | -------------------- | ----------------- | --------------------- |
| Haiku 5.5  | 9            | 0%            | 37.5%       | 0%            | 0%                    | 0%                   | 58.3%             | 2417                  |
| Sonnet 5.5 | 9            | 0%            | 50%         | 0%            | 0%                    | 0%                   | 31.9%             | 780                   |
| Opus 5.5   | 10           | 0%            | 47.2%       | 0%            | 0%                    | 0%                   | 37.5%             | 798                   |
| Fable 5.1  | 10           | 0%            | 62.5%       | 0%            | 0%                    | 0%                   | 40.3%             | 802                   |

## Frequently asked questions

### Did any model mention Nike in its questions?

No. The code measured 0% for naming a studied brand for every model. The questions describe a need, such as a marathon, a tennis habit or a gift, and leave the brand for the AI answer to supply.

### Why do many questions not end with a question mark?

Many drafts are written like search phrases, for example a request that starts with "Best" or "Compare". The share ending with a question mark ranges from 37.5% for Claude Haiku 5.5 to 62.5% for Claude Fable 5.1.

### Does this study say which model to use for prompt lists?

No. It does not rank the models or effort levels. The tables list every question from every run, so you can compare them with the prompts you already track and decide for your own brand.
