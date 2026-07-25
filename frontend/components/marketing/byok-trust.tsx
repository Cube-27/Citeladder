import { KeyRound, Lock, ShieldCheck } from 'lucide-react';

/** ByokTrust — BYOK trust microcopy shown beneath the primary CTAs. */
export function ByokTrust() {
  return (
    <div className="trust">
      <span>
        <KeyRound strokeWidth={1.8} aria-hidden />
        Bring your own API keys
      </span>
      <span className="sep" aria-hidden="true">
        ·
      </span>
      <span>
        <Lock strokeWidth={1.8} aria-hidden />
        Encrypted at rest
      </span>
      <span className="sep" aria-hidden="true">
        ·
      </span>
      <span>
        <ShieldCheck strokeWidth={1.8} aria-hidden />
        No LLM-as-judge scoring
      </span>
    </div>
  );
}
