import { z } from 'zod';

/**
 * The screen an Action belongs to, derived at every refresh: `content` for a
 * content page or a content-gap planned page, `actions` for everything else.
 * Every read that carries an Action id for a link carries its surface beside
 * it, so the link opens under that surface's screen (`actionPath`). A leaf
 * module: the contracts that carry it import nothing else through it.
 */
export const actionSurfaceSchema = z.enum(['actions', 'content']);
export type ActionSurface = z.infer<typeof actionSurfaceSchema>;
