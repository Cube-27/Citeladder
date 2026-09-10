'use client';

import { useEffect, useRef, useState } from 'react';

import type { ContentTargetPage } from '@/lib/api/content';

import type { ContentOpportunityContext } from './content-screen-data';
import type { useSiteHealthHandoff } from './content-screen-data';

/**
 * Whether an identifier-derived default at `priority` may claim the skill slot,
 * recording the claim when it does. Deciding here rather than inside a
 * `setState` updater keeps the ref write out of a callback React may replay.
 */
function claimAutomaticSkill(
  priority: number,
  automatic: { current: { priority: number } | null },
  userSelected: { current: boolean },
): boolean {
  if (userSelected.current || (automatic.current?.priority ?? -1) > priority) return false;
  automatic.current = { priority };
  return true;
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
    const claimed = claimAutomaticSkill(2, automaticSkill, userSelectedSkill);
    setChosenSkillId((current) => (claimed ? opportunity.suggestedSkillId : current));
    if (opportunity.pathway === 'owned' && opportunity.targetUrl) {
      setTarget({ url: opportunity.targetUrl });
      setTargetSearch(opportunity.targetUrl);
      setTargetUrl(opportunity.targetUrl);
    }
  }, [opportunity]);

  useEffect(() => {
    if (!siteHealth || appliedSiteHealth.current === siteHealth.source_analysis_id) return;
    appliedSiteHealth.current = siteHealth.source_analysis_id;
    const claimed = claimAutomaticSkill(3, automaticSkill, userSelectedSkill);
    setChosenSkillId((current) => (claimed ? siteHealth.suggested_skill_id : current));
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
