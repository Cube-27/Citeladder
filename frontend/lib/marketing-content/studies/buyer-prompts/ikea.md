---
title: 'Buyer questions for IKEA, drafted by four Claude models'
slug: '/buyer-prompts/ikea'
meta_title: 'Buyer questions for IKEA, drafted by four Claude models'
meta_description: "The same CiteLadder Prompt Builder step, run on four Claude models at low, medium and high effort, twice each, for IKEA's 12 planned question slots. What changed and what the code measured."
primary_keyword: 'IKEA buyer prompts'
secondary_keywords:
  [
    'affordable home furnishings retailer prompts',
    'AI visibility prompts',
    'buyer questions for AI search',
  ]
search_intent: 'See the buyer questions four Claude models draft for IKEA and compare them'
content_type: 'model comparison page'
related_guides: ['/research/prompt-builder-model-comparison-2026', '/buyer-prompts/wise']
index_group: 'Consumer brands'
index_meta: 'affordable home furnishings retailer'
reviewed_at: '2026-11-07'
published_at: '2026-11-07'
author: 'Abhineet Jain'
product:
  heading: 'Track buyer questions for your brand'
  href: '/platform/ai-visibility'
  body: "CiteLadder tracks your brand's mentions, position, sentiment and competitors across ChatGPT, Gemini, Claude, Google AI Overviews and Google AI Mode. Every result is tied to the answer it was recorded from."
---

CiteLadder's Prompt Builder drafts the short buyer questions a brand tracks in AI answers. For this study it ran the same step, with the same instructions, the same IKEA business profile and the same 12 planned slots, on Claude Haiku 5.5, Claude Sonnet 5.5, Claude Opus 5.5 and Claude Fable 5.1. Each model ran at low, medium and high effort, twice per setting. Only the model and the effort changed. The tables below this text list every question each model wrote. This page describes what can be observed in them. Judging quality is left to the reader.

## What the profile says IKEA sells

The business profile describes IKEA as an affordable home furnishings retailer. The business model is retail, and the buyer type is both consumers and businesses. Category terms include flat-pack furniture, home decor, storage solutions and kitchen furniture.

The profile lists four offerings. Each one became a topic:

- **Living room furniture**: sofas, sectionals, sleeper sofas, armchairs, bookcases and TV storage units.
- **Storage and organization solutions**: storage combinations, bookcases, wardrobes, containers, organizers and baskets.
- **Beds and mattresses**: bed frames, mattresses, bedding, duvet covers and bedroom furniture.
- **Kitchen cabinets and appliances**: cabinet systems, appliances, kitchenware and tableware, with planning tools for remodels.

Each offering also carries attributes, situations and audiences. Examples are "Removable washable covers", "Moving out for college" and "Landlords". The slot plan draws on these.

## How the 12 slots were planned

Each topic received three slots. Within a topic, every slot targets a different buyer stage and a different facet of the offering:

- **Slot 1, awareness**, paired with a situation. The allowed intents are learn, solve and recommend.
- **Slot 2, consideration**, paired with an audience. The allowed intents are solve, recommend, compare and validate.
- **Slot 3, decision**, paired with an attribute. The allowed intents are compare, validate, buy and recommend.

For IKEA, the situations are "Furnishing a first apartment", "Maximizing small spaces", "Bedroom makeover" and "Rental property refresh". The audiences are "Renters", "Homeowners", "Parents of young children" and "Small business owners". The attributes are "Low price point", "Door and drawer options", "Under-bed storage" and "Installation service available".

Every model received this same plan. All 12 slots are in the core cohort.

## What differs between the models' questions

**Length.** The median question is 9 words for Claude Haiku 5.5, 10 for Claude Sonnet 5.5 and Claude Opus 5.5, and 11 for Claude Fable 5.1. No model wrote a question over 16 words.

**Question marks.** Claude Haiku 5.5 often wrote search-style phrases without a question mark, for example "Best affordable sofa for a first apartment". About 44% of its questions end in a question mark. The figure is about 65% for Claude Sonnet 5.5, 54% for Claude Opus 5.5 and 78% for Claude Fable 5.1.

**First-person framing.** All four models use first-person openings in the audience slots, such as "I'm renting", "I own my home" and "I run a small cafe". Claude Sonnet 5.5 uses this pattern in most of its consideration slots, as in "I have toddlers, what's a good affordable bed and mattress set?"

**Openings.** Claude Opus 5.5 and Claude Fable 5.1 often open with a situation clause and then ask. One question shows this: "Furnishing my first apartment, where should I buy living room furniture?" Both models wrote it in several outputs. Claude Fable 5.1 extends the pattern to other slots, with openings such as "Redoing my bedroom" and "Refreshing a rental property kitchen".

**What the question asks for.** Claude Opus 5.5 and Claude Fable 5.1 often ask for stores, retailers or brands. Claude Haiku 5.5 more often names a product type and a need.

**How specific.** For the small business slot, most outputs from every model picture a small cafe. Claude Fable 5.1 also wrote some of the most detailed scenarios in the set, including "Our kids' bunk bed wobbles, any sturdier beds for young children?"

## Effort levels and repeat runs

**Effort.** For Claude Haiku 5.5, the low-effort outputs are mostly phrases without question marks. At high effort, nearly every question it wrote ends in one. For the other three models, the wording shifts only slightly between low, medium and high effort. The same framings carry across all three levels.

**Repeat runs.** Claude Sonnet 5.5 repeats many questions word for word. "Where can I buy a cheap sectional sofa online?" appears in several of its outputs across efforts. Its toddler question quoted above appears in both low-effort runs and both high-effort runs. Claude Opus 5.5 also repeats whole questions across runs, especially in the storage and kitchen slots.

Claude Haiku 5.5 varies more between runs of the same setting. Its low-effort run 1 and run 2 share the t1s1 question and differ in most other slots.

For Claude Fable 5.1, the second high-effort run contains framings found in no other output. One example is "Ottoman bed or drawer bed frame for under-bed storage, which to buy?" Another output in that run sets the small business slot in a salon break room.

## What the code measured

Each model produced 6 outputs, which gives 72 prompts per model. The code counted the following for each model:

- **Median words**: 9 for Claude Haiku 5.5, 10 for Claude Sonnet 5.5, 10 for Claude Opus 5.5 and 11 for Claude Fable 5.1.
- **Questions over 16 words**: 0 for every model.
- **Questions naming a studied brand**: 0 for every model. No question names IKEA.
- **Questions naming a place**: 0 for every model.
- **Questions joined with "or"**: 0 for three models and 2.8% for Claude Fable 5.1.
- **Questions ending in a question mark**: 44.4% for Claude Haiku 5.5, 65.3% for Claude Sonnet 5.5, 54.2% for Claude Opus 5.5 and 77.8% for Claude Fable 5.1.
- **Near-duplicate pairs**: 0 for every model.
- **Distinct openers**: 63.9% for Claude Haiku 5.5, 30.6% for Claude Sonnet 5.5, 43.1% for Claude Opus 5.5 and 50% for Claude Fable 5.1.
- **Mean output tokens**: 3212 for Claude Haiku 5.5, 826 for Claude Sonnet 5.5, 821 for Claude Opus 5.5 and 1057 for Claude Fable 5.1.

These counts describe form only. They do not score whether a question is useful for tracking.

## Every question, side by side

Run 1 of each setting. Each row is one planned slot; the model and the effort are the only things that change across a row and down a stage.

### Living room furniture

| Stage         | Model      | Low effort                                                                | Medium effort                                                            | High effort                                                              |
| ------------- | ---------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Awareness     | Haiku 5.5  | Best affordable sofa for a first apartment                                | Best affordable living room furniture for a first apartment              | What affordable sofa suits a first apartment?                            |
| Awareness     | Sonnet 5.5 | Best affordable sofa and armchair ideas for my first apartment            | Best affordable sofa and armchair picks for my first apartment           | Best affordable sofas and armchairs for furnishing my first apartment    |
| Awareness     | Opus 5.5   | Where should I buy living room furniture for my first apartment?          | Furnishing my first apartment, where should I buy living room furniture? | Furnishing my first apartment, where should I buy living room furniture? |
| Awareness     | Fable 5.1  | Where should I buy living room furniture for my first apartment?          | Furnishing my first apartment, where should I buy living room furniture? | Furnishing my first apartment, where should I buy living room furniture? |
| Consideration | Haiku 5.5  | Compare living room furniture options for renters                         | I'm renting, what living room furniture should I shortlist?              | I'm a renter, which affordable sofa brands should I compare?             |
| Consideration | Sonnet 5.5 | I rent my flat, where can I buy a sofa that's easy to move?               | I'm renting, where can I buy a sofa that's easy to move?                 | I'm renting, where can I buy a sleeper sofa that's easy to move?         |
| Consideration | Opus 5.5   | I'm renting, which stores sell living room furniture that's easy to move? | I rent, what's a good sofa that's easy to move later?                    | I'm renting, what are good stores for affordable sofas that move easily? |
| Consideration | Fable 5.1  | I'm renting, what sofa and shelving can I move easily later?              | I'm renting, which sofas and TV units are easy to move later?            | I'm renting, which living room furniture brands are easy to move later?  |
| Decision      | Haiku 5.5  | Cheapest armchair to buy for a living room                                | Lowest priced living room sofa to buy online                             | Where can I buy the cheapest living room sofa set?                       |
| Decision      | Sonnet 5.5 | Where can I buy the cheapest decent sectional sofa?                       | Where can I buy a cheap sectional sofa without sacrificing style?        | Where can I buy a cheap sectional sofa online?                           |
| Decision      | Opus 5.5   | Cheapest places to buy a decent sofa and armchair set online              | Cheapest stores for a decent sofa and TV unit, compared                  | Cheapest places to buy a decent sofa online right now                    |
| Decision      | Fable 5.1  | Cheapest place to get a full living room set that still looks decent?     | Cheapest places to buy a decent sofa and bookcase right now              | Cheapest stores for a sofa and TV unit that don't fall apart?            |

### Storage and organization solutions

| Stage         | Model      | Low effort                                                                             | Medium effort                                                           | High effort                                                                |
| ------------- | ---------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Awareness     | Haiku 5.5  | Best storage units for a very small apartment                                          | Storage furniture to maximize a small space, any suggestions?           | Best space-saving storage furniture for a small room?                      |
| Awareness     | Sonnet 5.5 | Recommend storage furniture that makes a tiny bedroom feel bigger                      | Recommend storage furniture that makes the most of a tiny apartment     | Recommend storage furniture that makes a tiny studio feel bigger           |
| Awareness     | Opus 5.5   | Best storage furniture brands for a tiny studio apartment                              | Best storage furniture for a tiny studio apartment                      | Best storage furniture brands for a tiny studio apartment                  |
| Awareness     | Fable 5.1  | Looking for storage units that make a tiny studio feel less cluttered                  | Any storage units that make a tiny studio feel less cluttered?          | Looking for storage solutions to make the most of a tiny studio            |
| Consideration | Haiku 5.5  | Shortlist of storage units for a homeowner                                             | I own my home, which storage units should I compare?                    | As a homeowner, which affordable storage cabinets should I shortlist?      |
| Consideration | Sonnet 5.5 | I'm a homeowner, who sells good-value wardrobe and storage systems?                    | I own my home and need wardrobes and storage systems, who sells them?   | I just bought a house, which stores sell good wardrobe systems?            |
| Consideration | Opus 5.5   | Looking for built-in style storage systems for my house, which retailers compare well? | Homeowner here, which brands make good built-in style wardrobe systems? | As a homeowner, which retailers sell good built-in style wardrobe systems? |
| Consideration | Fable 5.1  | Recommend built-in style storage systems for our new house's spare room                | Just bought a house, best stores for wardrobes and storage systems?     | Just bought a house, best places for whole-home storage systems?           |
| Decision      | Haiku 5.5  | Where can I buy a storage cabinet with drawers                                         | Storage unit with drawers to buy online                                 | Any storage cabinet with drawers worth buying?                             |
| Decision      | Sonnet 5.5 | Compare storage cabinets with drawers versus doors, where to buy?                      | Compare storage units with drawers versus doors for a hallway           | Any storage cabinet brands with lots of drawer and door choices?           |
| Decision      | Opus 5.5   | Recommend storage cabinet systems where I can choose my own doors                      | Where can I buy storage units with customizable doors and drawers?      | Where can I buy storage units with customizable doors and drawers?         |
| Decision      | Fable 5.1  | Best storage combination with doors to hide clutter in the hallway?                    | Looking for a storage combination with doors to hide the mess           | Where can I buy storage units that come with door and drawer options?      |

### Beds and mattresses

| Stage         | Model      | Low effort                                                           | Medium effort                                                      | High effort                                                                   |
| ------------- | ---------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Awareness     | Haiku 5.5  | Affordable bed frame options for a bedroom makeover                  | Budget bed frames to start a bedroom makeover                      | Looking for a budget bed to refresh my bedroom                                |
| Awareness     | Sonnet 5.5 | Looking for a budget bed frame and mattress for a bedroom makeover   | Looking for a budget bed frame and mattress for a bedroom makeover | Looking for budget bed frames and bedding for a bedroom makeover              |
| Awareness     | Opus 5.5   | Any affordable stores for a new bed frame during a bedroom makeover? | Looking for affordable bed frames to refresh my bedroom            | Looking for budget bed frames to refresh my bedroom                           |
| Awareness     | Fable 5.1  | Redoing my bedroom, where can I get an affordable new bed frame?     | Redoing my bedroom, where can I get a bed and mattress cheaply?    | Doing a bedroom makeover, which stores sell affordable bed and mattress sets? |
| Consideration | Haiku 5.5  | I have toddlers, what affordable mattress would you recommend        | Compare affordable mattresses for parents with a toddler           | Which mattress brands suit parents of toddlers?                               |
| Consideration | Sonnet 5.5 | I have toddlers, what's a good affordable bed and mattress set?      | I have toddlers, what are good affordable beds for their rooms?    | I have toddlers, what's a good affordable bed and mattress set?               |
| Consideration | Opus 5.5   | Best budget mattresses for a toddler's first big bed                 | Any budget mattresses for a toddler's first big bed?               | Recommend affordable mattresses for toddlers moving into a big-kid bed        |
| Consideration | Fable 5.1  | Any good budget beds for toddlers moving out of a crib?              | We have two toddlers, which kids beds hold up and don't cost much? | Any good bed brands for a toddler moving out of the cot?                      |
| Decision      | Haiku 5.5  | Compare bed frames with under-bed storage drawers                    | Where can I buy a bed frame with under-bed storage?                | Bed frames with under-bed storage, which should I buy?                        |
| Decision      | Sonnet 5.5 | Any good cheap bed frames with built-in storage underneath?          | Any good bed frames with built-in under-bed storage to buy?        | Who sells affordable bed frames with built-in under-bed storage?              |
| Decision      | Opus 5.5   | Where can I buy a cheap bed frame with storage drawers underneath?   | Best value bed frames with built-in under-bed drawers              | Best affordable bed frames with built-in storage drawers                      |
| Decision      | Fable 5.1  | Which bed frames with under-bed storage drawers are worth buying?    | Recommend an affordable bed frame with built-in under-bed storage  | Best bed frames with under-bed storage to buy right now?                      |

### Kitchen cabinets and appliances

| Stage         | Model      | Low effort                                                                        | Medium effort                                                                | High effort                                                                  |
| ------------- | ---------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Awareness     | Haiku 5.5  | Affordable kitchen cabinets for a rental property refresh                         | Budget kitchen cabinets for a rental property refresh                        | What affordable kitchen cabinets work for a rental refresh?                  |
| Awareness     | Sonnet 5.5 | Affordable kitchen cabinets and appliances for refreshing a rental property       | What's a good budget kitchen cabinet and appliance set for a rental refresh? | Best budget kitchen cabinets for refreshing a rental property                |
| Awareness     | Opus 5.5   | Budget kitchen cabinet brands for refreshing a rental property                    | Cheap kitchen cabinets to update a rental property quickly                   | Cheap kitchen cabinets for updating a rental property                        |
| Awareness     | Fable 5.1  | I need cheap kitchen cabinets to refresh a rental property quickly                | Need a cheap kitchen refresh for my rental property, who sells cabinets?     | Refreshing a rental property kitchen on a budget, who sells cheap cabinets?  |
| Consideration | Haiku 5.5  | Kitchen appliances for a small business owner on a budget                         | I run a small business, which kitchen appliances should I compare?           | I run a small café, which kitchen appliances should I compare?               |
| Consideration | Sonnet 5.5 | I run a small cafe, where can I get budget kitchen cabinets?                      | I run a small cafe, where can I get affordable kitchen cabinets?             | I run a small cafe, where can I get affordable kitchen appliances?           |
| Consideration | Opus 5.5   | I run a small cafe, who sells affordable kitchen cabinets and appliances?         | I run a small cafe, who sells affordable kitchen cabinets and appliances?    | I run a small café, where can I get affordable kitchen cabinets?             |
| Consideration | Fable 5.1  | I run a small cafe, what affordable kitchen cabinet systems hold up to daily use? | I run a small cafe, where can I buy basic kitchen cabinets affordably?       | I run a small cafe, which kitchen cabinet suppliers suit a business kitchen? |
| Decision      | Haiku 5.5  | Where can I buy kitchen cabinets with installation included                       | Where can I buy kitchen cabinets with installation included?                 | Who offers kitchen cabinet installation for a remodel?                       |
| Decision      | Sonnet 5.5 | Who sells affordable kitchen cabinets with installation included?                 | Who sells kitchen cabinets with professional installation included?          | Which kitchen cabinet sellers also offer installation?                       |
| Decision      | Opus 5.5   | Which kitchen cabinet retailers also offer professional installation?             | Which kitchen retailers include cabinet installation with the purchase?      | Which kitchen cabinet retailers offer installation with purchase?            |
| Decision      | Fable 5.1  | Who sells kitchen cabinets and also handles the installation?                     | Which kitchen cabinet retailers also offer installation?                     | Which kitchen cabinet retailers include an installation service?             |

## What the code measured for IKEA

All six outputs per model (three efforts, two runs), 72 questions each.

| Model      | Median words | Over 16 words | Ends with ? | Contains "or" | Names a studied brand | Near-duplicate pairs | Distinct openings | Output tokens per run |
| ---------- | ------------ | ------------- | ----------- | ------------- | --------------------- | -------------------- | ----------------- | --------------------- |
| Haiku 5.5  | 9            | 0%            | 44.4%       | 0%            | 0%                    | 0%                   | 63.9%             | 3212                  |
| Sonnet 5.5 | 10           | 0%            | 65.3%       | 0%            | 0%                    | 0%                   | 30.6%             | 826                   |
| Opus 5.5   | 10           | 0%            | 54.2%       | 0%            | 0%                    | 0%                   | 43.1%             | 821                   |
| Fable 5.1  | 11           | 0%            | 77.8%       | 2.8%          | 0%                    | 0%                   | 50%               | 1057                  |

## Frequently asked questions

### Did any model mention IKEA in its questions

No. The code found 0% of questions naming a studied brand for all four models. The questions describe a buyer need and leave the AI assistant to name businesses.

### Were the models given different instructions or slots

No. Every run used the same instructions, the same IKEA business profile and the same 12 planned slots. Only the model and the effort level changed, and each setting ran twice.

### Why do some questions have no question mark

Some outputs are written as search-style phrases. This is most visible in the low-effort outputs from Claude Haiku 5.5. The share of questions ending in a question mark ranges from 44.4% to 77.8% across the four models.

### Which model should I use for my prompt list

This study does not rank the models. It shows every question in the tables below and reports what the code counted. Which set fits your tracking is your call.
