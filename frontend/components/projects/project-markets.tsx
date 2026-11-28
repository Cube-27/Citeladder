import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { MARKET_COUNTRIES, MARKET_LANGUAGES } from '@citeladder/contracts/markets';

import { Button, IconButton } from '@/components/ui/button';
import { Columns, Inline } from '@/components/ui/layout';
import { MarketSelect } from '@/components/ui/market-select';
import { Section, SectionBleed, SectionHeader, SectionTitle } from '@/components/ui/section';
import { X } from '@/lib/icons';
import { projectMutations } from '@/lib/api/projects';
import { useProjectMarkets } from '@/lib/project/use-project-markets';
import { Notice } from '@/components/ui/notice';
import { Text } from '@/components/ui/typography';

export function ProjectMarkets({
  projectId,
  workspaceId,
}: Readonly<{ projectId: string; workspaceId: string }>) {
  const scope = { workspaceId, projectId };
  const markets = useProjectMarkets(projectId, workspaceId);
  const [country, setCountry] = useState('');
  const [language, setLanguage] = useState('');
  const add = useMutation(projectMutations.addMarket(scope));
  const remove = useMutation(projectMutations.removeMarket(scope));
  const addMarket = () =>
    add.mutate(
      { country_code: country, language_code: language },
      {
        onSuccess: () => {
          setCountry('');
          setLanguage('');
        },
      },
    );
  const extra = markets.filter((market) => !market.is_default);
  const failed = add.error ?? remove.error;
  return (
    <Section aria-labelledby="additional-markets">
      <SectionHeader>
        <SectionTitle id="additional-markets" level={3}>
          Additional markets
        </SectionTitle>
      </SectionHeader>
      {extra.length ? (
        <SectionBleed as="ul" rows>
          {extra.map((market) => (
            <Inline as="li" key={market.id} justify="between">
              <Text variant="body" tone="ink-2">
                {market.label}
              </Text>
              <IconButton
                icon={X}
                label={`Remove ${market.label}`}
                disabled={remove.isPending}
                onClick={() => market.id && remove.mutate(market.id)}
              />
            </Inline>
          ))}
        </SectionBleed>
      ) : null}
      <Columns template="fields-action" gap="item" align="end">
        <MarketSelect
          ariaLabel="Market country"
          value={country}
          onChange={setCountry}
          options={MARKET_COUNTRIES}
        />
        <MarketSelect
          ariaLabel="Market language"
          value={language}
          onChange={setLanguage}
          options={MARKET_LANGUAGES}
        />
        <Button
          variant="secondary"
          disabled={!country || !language || add.isPending}
          onClick={addMarket}
        >
          {add.isPending ? 'Adding…' : 'Add market'}
        </Button>
      </Columns>
      {failed ? (
        <Notice
          kind="mutation"
          error={failed}
          act={add.error ? 'add the market' : 'remove the market'}
        />
      ) : null}
    </Section>
  );
}
