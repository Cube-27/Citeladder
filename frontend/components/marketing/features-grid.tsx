import { Columns3, FileSearch, Lock, MessagesSquare, Repeat2, Target } from 'lucide-react';

const FEATURES = [
  {
    icon: MessagesSquare,
    title: 'Three-engine coverage',
    body: 'One audit queries ChatGPT, Gemini, and Claude side by side. Same prompts, same repetitions, comparable scores.',
  },
  {
    icon: Target,
    title: 'Deterministic scoring',
    body: 'Mentions, citations, and share of answers is computed from the raw response text. Same data, same score.',
  },
  {
    icon: FileSearch,
    title: 'Evidence explorer',
    body: 'Every metric links to the exact run it came from. Open the raw response in Runs and check the math yourself.',
  },
  {
    icon: Columns3,
    title: 'Competitor benchmarking',
    body: 'Track the competitors that matter. Watch share-of-voice shift across engines, prompt by prompt.',
  },
  {
    icon: Lock,
    title: 'Your own API keys',
    body: 'Audits run on your own provider keys — encrypted at rest, write-only, and never returned by the API.',
  },
  {
    icon: Repeat2,
    title: 'Repeatable trends',
    body: 'Rerun audits on your cadence. Watch visibility move period over period, engine over engine.',
  },
] as const;

/** FeaturesGrid — section #features: what an audit gives you, six cards. */
export function FeaturesGrid() {
  return (
    <section className="features" id="features" aria-label="Features">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">What you get</span>
          <h2 className="h2">
            See every answer.
            <br />
            <span className="grad-text">Know what to do next.</span>
          </h2>
          <p>
            One workspace for your brand, your competitors, and the prompts that decide who gets
            recommended.
          </p>
        </div>
        <div className="features-grid stagger">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div className="card feature-card" key={title}>
              <span className="f-icon">
                <Icon strokeWidth={1.8} aria-hidden />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
