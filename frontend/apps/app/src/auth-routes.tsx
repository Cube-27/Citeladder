import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { LoginScreen } from '@/components/auth/login-screen';
import { RegisterScreen } from '@/components/auth/register-screen';
import { AuthShell } from '@/components/ui/auth-shell';
import { selfServeSignupOpen } from '@/lib/config/self-serve-signup';

const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export function LoginRoute() {
  const [searchParams] = useSearchParams();

  return (
    <AuthShell mainLabel="Account access">
      <LoginScreen
        demoMode={demoMode}
        signupOpen={selfServeSignupOpen()}
        searchParams={searchParams}
      />
    </AuthShell>
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
    <AuthShell mainLabel="Account access">
      <RegisterScreen
        demoMode={demoMode}
        signupOpen={selfServeSignupOpen()}
        replace={replace}
        searchParams={searchParams}
      />
    </AuthShell>
  );
}
