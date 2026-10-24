'use client';

import * as React from 'react';
import { updatePassword, type AuthState } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PasswordForm() {
  const [state, action, pending] = React.useActionState<AuthState, FormData>(updatePassword, {});
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="new-password">New password</Label>
        <Input id="new-password" name="password" type="password" minLength={8} autoComplete="new-password" required />
      </div>
      {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
      {state.message && <p className="text-sm text-sage" role="status">{state.message}</p>}
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? 'Updating…' : 'Update password'}
      </Button>
    </form>
  );
}
