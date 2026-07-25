import { EngineMark } from './engine-mark';

const STRIP_ENGINES = [
  { name: 'ChatGPT', brand: 'chatgpt', detail: 'OpenAI' },
  { name: 'Gemini', brand: 'gemini', detail: 'Google' },
  { name: 'Claude', brand: 'claude', detail: 'Anthropic' },
] as const;

const BUYER_PROMPTS = [
  'best CRM for a 20-person sales team',
  'notion vs coda for product docs',
  'top alternatives to salesforce',
  'which analytics tool do D2C founders use',
  'best project management tool for agencies',
] as const;

/** EngineStrip — the three answer engines every audit runs across. */
export function EngineStrip() {
  return (
    <section className="engine-strip" aria-label="Supported answer engines">
      <div className="container">
        <span className="engine-strip-label">Measured where buyers ask</span>
        <div className="engine-chips">
          {STRIP_ENGINES.map(({ name, brand, detail }) => (
            <span className={`engine-chip engine-chip-${brand} rim`} key={name}>
              <EngineMark name={name} />
              <span className="engine-wordmark">{name}</span>
              <small>{detail}</small>
            </span>
          ))}
        </div>
      </div>
      <div className="prompt-marquee" aria-label="Example audited buyer prompts">
        <div className="prompt-track">
          {[...BUYER_PROMPTS, ...BUYER_PROMPTS].map((prompt, index) => (
            <span aria-hidden={index >= BUYER_PROMPTS.length || undefined} key={`${prompt}-${index}`}>
              <i className={`engine-dot-${STRIP_ENGINES[index % STRIP_ENGINES.length].brand}`} />
              “{prompt}”
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
