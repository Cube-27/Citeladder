import { createContext } from 'react';

export const PageOpenContext = createContext<((siteUrlId: string) => void) | null>(null);
