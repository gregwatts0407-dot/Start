'use client';

import * as React from 'react';
import { MailCheck } from 'lucide-react';
import { signUp, type AuthState } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SignupForm() {
  const [state, action, pending] = React.useActionState<AuthState, FormData>(signUp, {});

  if (state.message) {
    return (
      <div className="space-y-3 rounded-3xl border bg-card p-6 text-center" role="status">
        <MailCheck className="mx-auto size-8 text-sage" aria-hidden />
        <p>{state.message}</p>
        <p className="text-sm text-muted-foreground">Open the link on this device to continue.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="displayName">Your name</Label>
        <Input id="displayName" name="displayName" autoComplete="given-name" required maxLength={60} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} aria-describedby="password-hint" />
        <p id="password-hint" className="text-xs text-muted-foreground">
          At least 8 characters.
        </p>
      </div>
      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? 'Creating your space…' : 'Create account'}
      </Button>
    </form>
  );
}
