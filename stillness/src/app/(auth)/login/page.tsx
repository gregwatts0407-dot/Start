import Link from 'next/link';
import { LoginForm } from '@/components/auth/login-form';
import { SetupNotice } from '@/components/setup-notice';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { safeNext } from '@/lib/utils';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Welcome back</h1>
        <p className="text-muted-foreground">Sign in to continue your practice.</p>
      </div>
      {isSupabaseConfigured() ? <LoginForm next={safeNext(next)} linkError={error === 'link'} /> : <SetupNotice />}
      <p className="text-center text-sm text-muted-foreground">
        New to Stillness?{' '}
        <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
