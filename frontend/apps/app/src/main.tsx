import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import './globals.css';
import { createAppQueryClient } from '@/lib/api/query-client';

import { appRoutes } from './router';
import './runtime.css';

const queryClient = createAppQueryClient();
const router = createBrowserRouter(appRoutes);
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Vite application root element was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
