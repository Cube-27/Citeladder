'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { RegisterScreen } from '@/components/auth/register-screen';

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <RegisterScreen
      demoMode={process.env.NEXT_PUBLIC_DEMO_MODE === 'true'}
      replace={(href) => router.replace(href)}
      searchParams={searchParams}
    />
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterPageContent />
    </Suspense>
  );
}
