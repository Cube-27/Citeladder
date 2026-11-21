import { Fragment } from 'react';

import { FAQ_GROUPS, type FaqGroup } from '@/lib/marketing-content/faq';

import { Linkify } from '../primitives/linkify';
import { FaqList } from '../sections/steps-faq-cta';

const GROUP_ANCHORS: Readonly<Record<string, string>> = {
  Platform: 'faq-platform',
  'Site Health': 'faq-site-health',
  'Data & security': 'faq-security',
  'Account & billing': 'faq-billing',
};

function fallbackAnchor(heading: string): string {
  let anchor = '';
  let needsSeparator = false;
  for (const character of heading.toLowerCase()) {
    const isAsciiLetter = character >= 'a' && character <= 'z';
    const isDigit = character >= '0' && character <= '9';
    if (isAsciiLetter || isDigit) {
      if (needsSeparator && anchor) anchor += '-';
      anchor += character;
      needsSeparator = false;
    } else {
      needsSeparator = true;
    }
  }
  return anchor;
}

function groupAnchor(group: Pick<FaqGroup, 'heading'>): string {
  return GROUP_ANCHORS[group.heading] ?? `faq-${fallbackAnchor(group.heading)}`;
}

export const FAQ_TOPICS = FAQ_GROUPS.map((group) => ({
  id: groupAnchor(group),
  label: group.heading,
  level: 2 as const,
}));

export function FaqGroups() {
  return (
    <>
      {FAQ_GROUPS.map((group) => (
        <Fragment key={group.heading}>
          <h2 id={groupAnchor(group)}>{group.heading}</h2>
          <FaqList
            items={group.items.map((item) => ({
              question: item.q,
              answer: (
                <p>
                  <Linkify text={item.a} />
                  {item.links?.map((link) => (
                    <span key={link.href}>
                      {' '}
                      <a href={link.href}>{link.label}</a>
                    </span>
                  ))}
                </p>
              ),
            }))}
          />
        </Fragment>
      ))}
    </>
  );
}
