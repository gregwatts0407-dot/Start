'use client';

import * as React from 'react';
import { MailCheck } from 'lucide-react';
import { signInWithMagicLink, signInWithPassword, type AuthState } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function LoginForm({ next, linkError }: { next: string; linkError: boolean }) {
  const [passwordState, passwordAction, passwordPending] = React.useActionState<AuthState, FormData>(signInWithPassword, {
    error: linkError ? 'That sign-in link has expired or was already used. Request a new one.' : undefined,
  });
  const [magicState, magicAction, magicPending] = React.useActionState<AuthState, FormData>(signInWithMagicLink, {});

  return (
    <Tabs defaultValue="password">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="password">Password</TabsTrigger>
        <TabsTrigger value="magic">Magic link</TabsTrigger>
      </TabsList>

      <TabsContent value="password">
        <form action={passwordAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required minLength={8} />
          </div>
          {passwordState.error && (
            <p className="text-sm text-destructive" role="alert">
              {passwordState.error}
            </p>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={passwordPending}>
            {passwordPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="magic">
        {magicState.message ? (
          <div className="space-y-3 rounded-3xl border bg-card p-6 text-center" role="status">
            <MailCheck className="mx-auto size-8 text-sage" aria-hidden />
            <p>{magicState.message}</p>
          </div>
        ) : (
          <form action={magicAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <div className="space-y-2">
              <Label htmlFor="magic-email">Email</Label>
              <Input id="magic-email" name="email" type="email" autoComplete="email" required />
            </div>
            <p className="text-sm text-muted-foreground">We’ll email you a link that signs you in — no password needed.</p>
            {magicState.error && (
              <p className="text-sm text-destructive" role="alert">
                {magicState.error}
              </p>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={magicPending}>
              {magicPending ? 'Sending…' : 'Email me a link'}
            </Button>
          </form>
        )}
      </TabsContent>
    </Tabs>
  );
}
