import { Check, ExternalLink } from 'lucide-react';

import { LANDING_CONTENT, type LandingChapter } from '@/lib/marketing-content/landing';

import { Reveal } from './motion-primitives';

/** Engines the run scene shows — same list, same order, as the engine strip. */
const RUN_SCENE_ENGINES = [
  ['ChatGPT', 'engine-dot-chatgpt'],
  ['Gemini', 'engine-dot-gemini'],
  ['Claude', 'engine-dot-claude'],
] as const;

/** Exhaustive over LandingChapter['scene'] — see FeatureVisual for the why. */
function ChapterScene({ scene }: Readonly<{ scene: LandingChapter['scene'] }>) {
  switch (scene) {
    case 'prompts':
      return (
        <div className="chapter-scene prompt-scene" aria-hidden="true">
          <small>Prompt library</small>
          <span><i>Discovery</i> best analytics platform for retail teams</span>
          <span><i>Compare</i> northwind vs shelfmetrics</span>
          <span><i>Purchase</i> analytics tools with first-party data</span>
        </div>
      );
    case 'engines':
      return (
        <div className="chapter-scene run-scene" aria-hidden="true">
          <small>Audit running</small>
          {RUN_SCENE_ENGINES.map(([name, className]) => (
            <span key={name}>
              <b><i className={className} />{name}</b>
              <em><i /></em>
              <Check />
            </span>
          ))}
        </div>
      );
    case 'evidence':
      return (
        <div className="chapter-scene evidence-scene" aria-hidden="true">
          <small>Deterministic scoring</small>
          <div><strong>62</strong><span>Visibility score</span></div>
          <p>analyzer v3.2 · rules v12 <Check /></p>
          <blockquote>mentions + citations + share of voice → <mark>same score</mark></blockquote>
        </div>
      );
    case 'receipt':
      return (
        <div className="chapter-scene evidence-scene" aria-hidden="true">
          <small>Evidence explorer</small>
          <div><strong>52%</strong><span>Visibility · comparison prompts</span></div>
          <p>drills to Run #47 · ChatGPT <ExternalLink /></p>
          <blockquote>“Northwind is a strong choice for…” <mark>[1]</mark></blockquote>
        </div>
      );
    default: {
      const unhandled: never = scene;
      throw new Error(`ChapterScene: unhandled scene ${String(unhandled)}`);
    }
  }
}

export function HowItWorks() {
  return (
    <section className="story" id="how-it-works" aria-labelledby="story-title">
      <div className="container">
        <Reveal className="section-head story-head">
          <span className="eyebrow">How it works</span>
          <h2 className="h2" id="story-title">
            From prompt <span className="serif-accent">to</span> proof.
          </h2>
          <p>Four chapters, one audit. No black boxes—every step leaves evidence you can open.</p>
        </Reveal>
        <div className="story-list">
          {LANDING_CONTENT.chapters.map((chapter) => (
            <Reveal className="story-chapter" key={chapter.number}>
              <div className="chapter-number">{chapter.number}</div>
              <div className="chapter-copy">
                <span>{chapter.eyebrow}</span>
                <h3>{chapter.title}</h3>
                <p>{chapter.body}</p>
              </div>
              <ChapterScene scene={chapter.scene} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
