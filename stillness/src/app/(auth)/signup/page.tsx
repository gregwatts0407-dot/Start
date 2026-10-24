import Link from 'next/link';
import { SignupForm } from '@/components/auth/signup-form';
import { SetupNotice } from '@/components/setup-notice';
import { isSupabaseConfigured } from '@/lib/supabase/env';

export const metadata = { title: 'Create an account' };

export default function SignupPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Begin with a breath</h1>
        <p className="text-muted-foreground">Create your free account. It takes less than a minute.</p>
      </div>
      {isSupabaseConfigured() ? <SignupForm /> : <SetupNotice />}
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
