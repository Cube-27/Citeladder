import { actionKinds } from './action-kinds.ts';
import { auditKinds } from './audit-kinds.ts';
import { importKinds } from './import-kinds.ts';
import { probeKinds } from './probe-kinds.ts';
import { projectKinds } from './project-kinds.ts';
import { promptKinds } from './prompt-kinds.ts';
import { promptSetKinds } from './prompt-set-kinds.ts';
import { siteHealthKinds } from './site-health-kinds.ts';

export const changeAreas = {
  'Prompts and topics': { ...promptKinds, ...promptSetKinds },
  'Project, markets and competitors': projectKinds,
  'Audits and probes': { ...auditKinds, ...probeKinds },
  'Site Health': siteHealthKinds,
  Actions: actionKinds,
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
  ...importKinds,
};

export type ChangeKind = keyof typeof changeKinds;
