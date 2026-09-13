import { createBrowserRouter } from 'react-router-dom';

import { LoginRoute, RegisterRoute } from './auth-routes';
import {
  ApplicationRouteLayout,
  OnboardingRoute,
  PrivateRouteLayout,
  ProjectsRoute,
} from './private-routes';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginRoute />,
  },
  {
    path: '/register',
    element: <RegisterRoute />,
  },
  {
    element: <PrivateRouteLayout />,
    children: [
      {
        path: '/onboarding',
        element: <OnboardingRoute />,
      },
      {
        element: <ApplicationRouteLayout />,
        children: [
          {
            path: '/projects',
            element: <ProjectsRoute />,
          },
        ],
      },
    ],
  },
]);
