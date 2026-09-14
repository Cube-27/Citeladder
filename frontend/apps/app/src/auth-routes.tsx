import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { AuthRouteShell } from '@/components/auth/auth-route-shell';
import { LoginScreen } from '@/components/auth/login-screen';
import { RegisterScreen } from '@/components/auth/register-screen';

const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export function LoginRoute() {
  const [searchParams] = useSearchParams();

  return (
    <AuthRouteShell>
      <LoginScreen demoMode={demoMode} searchParams={searchParams} />
    </AuthRouteShell>
  );
}

export function RegisterRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const replace = useCallback(
    (href: string) => {
      navigate(href, { replace: true });
    },
    [navigate],
  );

  return (
    <AuthRouteShell>
      <RegisterScreen demoMode={demoMode} replace={replace} searchParams={searchParams} />
    </AuthRouteShell>
  );
}
