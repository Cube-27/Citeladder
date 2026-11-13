import { Plus, X } from 'lucide-react';

import { ProviderList } from '@/components/providers/provider-list';
import { Button, IconButton } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Inline, Stack } from '@/components/ui/layout';
import type { LogicalEngine } from '@citeladder/contracts';
import { useEngineCatalog } from '@/lib/providers/engines';
import { toggleEngine } from '@/lib/runs/launch';
import { textRole } from '@/components/ui/typography';
import { panelClasses } from '@/components/ui/panel';

/**
 * Provider setup inside the launch dialog, instead of a second dialog stacked
 * on this one. It scrolls on its own so the launch controls stay in reach, and
 * a verified save refreshes the shared connections query, which turns the
 * engine chips on without leaving the dialog.
 */
function InlineProviderSetup({
  connecting,
  onClose,
}: Readonly<{ connecting: LogicalEngine | 'any'; onClose: () => void }>) {
  const engine = connecting === 'any' ? null : connecting;
  return (
    <Stack as="section" gap="item" aria-label="Connect a provider" className={panelClasses()}>
      <Inline className="justify-between">
        <p className={textRole('label')}>Connect a provider</p>
        <IconButton icon={X} label="Close provider setup" onClick={onClose} />
      </Inline>
      <div className="max-h-80 overflow-y-auto overscroll-contain">
        {/* Keyed by engine so clicking another engine opens its provider. */}
        <ProviderList key={engine ?? 'any'} expandEngine={engine} />
      </div>
    </Stack>
  );
}

/**
 * The engines to launch on, grouped into consumer experiences and APIs. An
 * engine without a connection opens provider setup in place instead.
 */
export function EnginesField({
  configuredEngines,
  unverifiedEngines,
  engines,
  setEngines,
  connecting,
  setConnecting,
}: Readonly<{
  configuredEngines: LogicalEngine[];
  unverifiedEngines: LogicalEngine[];
  engines: LogicalEngine[];
  setEngines: React.Dispatch<React.SetStateAction<LogicalEngine[]>>;
  connecting: LogicalEngine | 'any' | null;
  setConnecting: (target: LogicalEngine | 'any' | null) => void;
}>) {
  const catalog = useEngineCatalog();
  const noEngines = !configuredEngines.length;
  const selected = new Set(engines);
  return (
    <Stack as="fieldset" gap="item">
      <legend className={textRole('label')}>
        Engines <span className="text-ink-muted">*</span>
      </legend>
      {noEngines ? (
        <Stack gap="item">
          <p className="type-body">
            {unverifiedEngines.length
              ? `A key is stored for ${unverifiedEngines.map(catalog.label).join(', ')}, but it has not passed a connection test yet. Test it to launch an audit with it.`
              : 'No configured engines. Connect a provider to launch an audit.'}
          </p>
          <div>
            <Button
              variant="secondary"
              onClick={() => setConnecting(unverifiedEngines[0] ?? 'any')}
            >
              {unverifiedEngines.length ? 'Test connection' : 'Connect a provider'}
            </Button>
          </div>
        </Stack>
      ) : null}
      {[true, false].map((consumer) => (
        <Stack key={String(consumer)} gap="item">
          <p className={textRole('label')}>{consumer ? 'Consumer experiences' : 'APIs'}</p>
          <Inline className="flex-wrap">
            {catalog.order
              .filter((engine) => catalog.isObserved(engine) === consumer)
              .map((engine) => (
                <Button
                  key={engine}
                  variant="secondary"
                  aria-pressed={selected.has(engine)}
                  onClick={() =>
                    configuredEngines.includes(engine)
                      ? setEngines((current) => toggleEngine(current, engine))
                      : setConnecting(engine)
                  }
                >
                  {configuredEngines.includes(engine) ? null : <Icon icon={Plus} />}
                  {catalog.label(engine)}
                  {configuredEngines.includes(engine) ? null : (
                    <span className="sr-only">, not connected</span>
                  )}
                </Button>
              ))}
          </Inline>
        </Stack>
      ))}
      {connecting ? (
        <InlineProviderSetup connecting={connecting} onClose={() => setConnecting(null)} />
      ) : null}
    </Stack>
  );
}
