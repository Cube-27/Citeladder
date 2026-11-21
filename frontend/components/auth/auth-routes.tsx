import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { LoginScreen } from '@/components/auth/login-screen';
import { RegisterScreen } from '@/components/auth/register-screen';
import { AuthRouteShell } from '@/components/auth/auth-route-shell';
import { selfServeSignupOpen } from '@/lib/config/self-serve-signup';
import { useUrlSearch } from '@/lib/navigation/url-params';

const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export function LoginRoute() {
  const searchParams = useUrlSearch();

  return (
    <AuthRouteShell>
      <LoginScreen
        demoMode={demoMode}
        signupOpen={selfServeSignupOpen()}
        searchParams={searchParams}
      />
    </AuthRouteShell>
  );
}

export function RegisterRoute() {
  const navigate = useNavigate();
  const searchParams = useUrlSearch();
  const replace = useCallback(
    (href: string) => {
      navigate(href, { replace: true });
    },
    [navigate],
  );

  return (
    <AuthRouteShell>
      <RegisterScreen
        demoMode={demoMode}
        signupOpen={selfServeSignupOpen()}
        replace={replace}
        searchParams={searchParams}
      />
    </AuthRouteShell>
  );
}
