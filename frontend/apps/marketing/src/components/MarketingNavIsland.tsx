import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { MarketingNav } from '@/components/marketing/chrome/nav';
import { createAppQueryClient } from '@/lib/api/query-client';

/** Gives the interactive marketing navigation its request-local query cache. */
export function MarketingNavIsland() {
  const [queryClient] = useState(createAppQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <MarketingNav />
    </QueryClientProvider>
  );
}
