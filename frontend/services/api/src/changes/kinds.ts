import { actionKinds } from './action-kinds.ts';
import { auditKinds } from './audit-kinds.ts';
import { brandKinds } from './brand-kinds.ts';
import { commerceKinds } from './commerce-kinds.ts';
import { dataKinds } from './data-kinds.ts';
import { discoveryKinds } from './discovery-kinds.ts';
import { importKinds } from './import-kinds.ts';
import { probeKinds } from './probe-kinds.ts';
import { projectKinds } from './project-kinds.ts';
import { promptKinds } from './prompt-kinds.ts';
import { promptSetKinds } from './prompt-set-kinds.ts';
import { researchKinds } from './research-kinds.ts';
import { siteHealthKinds } from './site-health-kinds.ts';
import { themeKinds } from './theme-kinds.ts';

export const changeAreas = {
  'Prompts and topics': { ...promptKinds, ...promptSetKinds },
  'Project, markets and competitors': projectKinds,
  'Audits and probes': { ...auditKinds, ...probeKinds },
  'Site Health': siteHealthKinds,
  Actions: actionKinds,
  'Keyword research': researchKinds,
  'Demand and connected data': dataKinds,
  'Commerce (needs the commerce plan feature)': commerceKinds,
  'Brand, facts and themes (facts and verdicts need fact checking)': {
    ...brandKinds,
    ...themeKinds,
  },
  'Brand discovery (sets up a new project)': discoveryKinds,
  Imports: importKinds,
};

export const changeKinds = {
  ...promptKinds,
  ...promptSetKinds,
  ...projectKinds,
  ...auditKinds,
  ...probeKinds,
  ...siteHealthKinds,
  ...actionKinds,
  ...researchKinds,
  ...dataKinds,
  ...commerceKinds,
  ...brandKinds,
  ...themeKinds,
  ...discoveryKinds,
  ...importKinds,
};

export type ChangeKind = keyof typeof changeKinds;
