import { createContext } from 'react';

export type HeadingLevel = 1 | 2 | 3;

/**
 * The heading level a block state takes when its caller names none: 2 on a
 * page, 3 inside a Card, Section or DataTable whose own title is the h2 rung.
 * Apart from StateBlock, so a Section can set it without loading the block.
 */
export const StateHeadingLevelContext = createContext<HeadingLevel>(2);
