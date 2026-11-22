import { auditKinds } from './audit-kinds.ts';
import { importKinds } from './import-kinds.ts';
import { projectKinds } from './project-kinds.ts';
import { promptKinds } from './prompt-kinds.ts';

export const changeKinds = { ...promptKinds, ...projectKinds, ...auditKinds, ...importKinds };

export type ChangeKind = keyof typeof changeKinds;
