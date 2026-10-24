import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { getViewer } from '@/lib/data/session';

// Every page here depends on who is signed in.
export const dynamic = 'force-dynamic';

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-transparent bg-background/80 backdrop-blur-lg">
        <div className="container flex h-16 items-center justify-between">
          <Logo />
          <nav aria-label="Site" className="flex items-center gap-1 sm:gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/pricing">Pricing</Link>
            </Button>
            {viewer ? (
              <Button asChild size="sm">
                <Link href="/home">Open Stillness</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/signup">Start free</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="border-t">
        <div className="container flex flex-col gap-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <p>Made for quieter minds. Stillness is not a substitute for professional care.</p>
        </div>
      </footer>
    </div>
  );
}
