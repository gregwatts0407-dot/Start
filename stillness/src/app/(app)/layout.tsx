import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { PlayerProvider } from '@/components/player/player-provider';
import type { AmbientKind } from '@/components/player/ambient';
import { BottomNav, SidebarNav } from '@/components/shell/nav';
import { UserMenu } from '@/components/shell/user-menu';
import { Button } from '@/components/ui/button';
import { getViewer } from '@/lib/data/session';
import { signOut } from '@/actions/auth';

// Every page here depends on who is signed in.
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect('/login');
  if (!viewer.prefs.onboarded_at) redirect('/onboarding');

  const { profile, prefs, user, isPremium } = viewer;

  if (profile.is_suspended) {
    return (
      <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-semibold">Your account is paused</h1>
        <p className="max-w-md text-muted-foreground">
          An administrator has suspended this account. If you think this is a mistake, please contact support.
        </p>
        <form action={signOut}>
          <Button variant="outline">Sign out</Button>
        </form>
      </main>
    );
  }

  const menu = {
    id: profile.id,
    name: profile.display_name,
    avatarUrl: profile.avatar_url,
    email: user.email ?? '',
    isPremium,
  };

  return (
    <PlayerProvider defaultAmbient={(prefs.preferred_ambient as AmbientKind | null) ?? null} defaultVisibility={prefs.default_visibility}>
      <div className="min-h-dvh md:pl-64">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-card/50 px-4 py-6 backdrop-blur md:flex">
          <Logo href="/home" className="mb-8 px-3" />
          <SidebarNav role={profile.role} />
          <div className="mt-auto space-y-3">
            {!isPremium && (
              <Link
                href="/pricing"
                className="block rounded-2xl bg-gradient-to-br from-navy to-[#2b3560] p-4 text-white transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Sparkles className="mb-2 size-4 text-gold" aria-hidden />
                <p className="text-sm font-medium">Go deeper with Premium</p>
                <p className="mt-0.5 text-xs text-white/70">The full library, every program and offline listening.</p>
              </Link>
            )}
            <UserMenu {...menu} showName />
          </div>
        </aside>

        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/85 px-4 backdrop-blur-lg md:hidden">
          <Logo href="/home" />
          <UserMenu {...menu} />
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-44 pt-6 sm:px-6 md:pb-32 md:pt-10 lg:px-10">
          {children}
        </main>
        <BottomNav />
      </div>
    </PlayerProvider>
  );
}
