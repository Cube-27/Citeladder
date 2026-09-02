'use client';

import { useEffect, useRef, useState } from 'react';

import type { ContentTargetPage } from '@/lib/api/content';

import type { ContentOpportunityContext } from './content-screen-data';
import type { useSiteHealthHandoff } from './content-screen-data';

function replaceAutomaticSkill(
  current: string | null,
  next: string,
  priority: number,
  automatic: { current: { priority: number } | null },
  userSelected: { current: boolean },
): string | null {
  if (userSelected.current || (automatic.current?.priority ?? -1) > priority) return current;
  automatic.current = { priority };
  return next;
}

/** Apply identifier-derived defaults once while preserving every user choice. */
export function useOriginSelections(
  opportunity: ContentOpportunityContext | null,
  siteHealth: ReturnType<typeof useSiteHealthHandoff>['data'],
  initialSiteUrlId?: string,
) {
  const [chosenSkillId, setChosenSkillId] = useState<string | null>(null);
  const [target, setTarget] = useState<{ siteUrlId?: string; url?: string }>(() =>
    initialSiteUrlId ? { siteUrlId: initialSiteUrlId } : {},
  );
  const [targetSearch, setTargetSearch] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const automaticSkill = useRef<{ priority: number } | null>(null);
  const userSelectedSkill = useRef(false);
  const appliedOpportunity = useRef<string | null>(null);
  const appliedSiteHealth = useRef<string | null>(null);

  useEffect(() => {
    if (!opportunity || appliedOpportunity.current === opportunity.id) return;
    appliedOpportunity.current = opportunity.id;
    setChosenSkillId((current) =>
      replaceAutomaticSkill(
        current,
        opportunity.suggestedSkillId,
        2,
        automaticSkill,
        userSelectedSkill,
      ),
    );
    if (opportunity.pathway === 'owned' && opportunity.targetUrl) {
      setTarget({ url: opportunity.targetUrl });
      setTargetSearch(opportunity.targetUrl);
      setTargetUrl(opportunity.targetUrl);
    }
  }, [opportunity]);

  useEffect(() => {
    if (!siteHealth || appliedSiteHealth.current === siteHealth.source_analysis_id) return;
    appliedSiteHealth.current = siteHealth.source_analysis_id;
    setChosenSkillId((current) =>
      replaceAutomaticSkill(
        current,
        siteHealth.suggested_skill_id,
        3,
        automaticSkill,
        userSelectedSkill,
      ),
    );
    setTargetSearch(siteHealth.normalized_url);
  }, [siteHealth]);

  return {
    chosenSkillId,
    target,
    targetSearch,
    targetUrl,
    setTarget,
    setTargetSearch,
    setTargetUrl,
    chooseSkill: (value: string) => {
      userSelectedSkill.current = true;
      setChosenSkillId(value);
    },
  };
}

export function opportunityTarget(
  target: { siteUrlId?: string; url?: string },
  opportunity: ContentOpportunityContext | null,
  pages: readonly ContentTargetPage[],
) {
  if (target.siteUrlId || !target.url || target.url !== opportunity?.targetUrl) return target;
  const normalized = target.url.toLowerCase().replace(/\/$/, '');
  const page = pages.find(
    (candidate) => candidate.url.toLowerCase().replace(/\/$/, '') === normalized,
  );
  return page ? { siteUrlId: page.site_url_id } : target;
}
