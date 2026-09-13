import { createBrowserRouter } from 'react-router-dom';

import { SessionProbe } from './session-probe';

export const router = createBrowserRouter([
  {
    path: '/__migration/app',
    element: <SessionProbe />,
  },
]);
