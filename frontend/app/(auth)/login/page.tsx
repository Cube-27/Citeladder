'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import { LoginScreen } from '@/components/auth/login-screen';

function LoginPageContent() {
  const searchParams = useSearchParams();

  return (
    <LoginScreen
      demoMode={process.env.NEXT_PUBLIC_DEMO_MODE === 'true'}
      searchParams={searchParams}
    />
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
