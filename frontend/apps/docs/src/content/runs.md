---
title: 'Audits and runs'
description: 'Run, schedule and check the audits behind every AI visibility figure, in one market or several.'
group: 'Measure and understand'
order: 105
updated: '2026-11-22'
---

An audit sends your tracked prompts to the engines you choose and saves every answer. **Insights**, **Perception**, **Competitors** and **Sources** all read those saved answers; opening them never starts a run.

## Run a useful audit

Choose the prompts, engines and repetitions in the audit launcher. CiteLadder measures answers from ChatGPT, Claude, Gemini, Google AI Overviews and Google AI Mode, collected from the consumer apps and from provider APIs; a collected answer can differ from what a signed-in user sees. Engines reached through a provider API get your prompt with no instruction on length or style, so they answer at the length a person would see; ChatGPT and Claude can search the web up to twice for each answer, and the engine's full response is stored as evidence. Google AI Mode is selected in the launcher with the other engines and counts like any other engine in the estimate; untick it to leave it out. Schedules keep the engines they were created with. Review the estimate before confirming. More repetitions give more observations under that run's conditions; they do not turn a sample into a guarantee about every user's experience.

An audit keeps the prompts, tracked roster, topics and measurement configuration it used. Check **Runs** for completion, cancellation and unsuccessful attempts.

## Measure more than one market

A project measures from its own country and language by default. On Growth and Scale plans you can add markets, a country with a language, in the project edit panel under **Additional markets** (Growth includes 3, Scale 10). When a project has more than one market, the audit launcher and **Scheduled audits** ask which markets to measure; each market becomes its own run, launched together.

Answers collected from the consumer apps (ChatGPT Search, Gemini, Google AI Overviews and Google AI Mode) can only be measured in the countries and languages that collection supports, which differ by app; a regional language such as Brazilian Portuguese is measured as Portuguese, and the launcher refuses an unsupported pick before anything runs. The Gemini API has no location setting, so it runs only in the default market and shows as not available in others. A prompt that names a place is still measured from the market you pick.

The Brand pages and Sources then show a market filter, and Insights adds **By market**: each market's latest run side by side, with the change since that market's previous comparable run. Markets are never pooled, and a market you have not run yet shows as not run, not zero.

## Schedule audits

To measure on a regular cadence, open **Runs** and use **Scheduled audits**. Choose a prompt set, the measurement scope, the engines and a cadence: one time, every few minutes (at least five), hourly, daily or weekly. The first scheduled run starts right away, and later runs follow your browser's time zone.

A schedule pauses itself when it cannot start runs, for example when your plan or trial has ended, an engine connection is missing or the included budget is used up. The row shows why it paused; fix the cause and choose **Resume**.

## Respond to a change

First check whether the engine, prompt set, topic, market or successful-answer coverage changed. The Insights trend marks the days prompts, models and Actions changed, so a jump that lines up with a marker may come from what was measured rather than from how engines answered. Then inspect which answers and sources explain the difference.

Use an Action or a focused Agent question to turn the evidence into work. Avoid attributing movement to a website edit until you have examined later compatible measurements and their limitations.
