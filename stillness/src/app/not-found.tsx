import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LogoMark } from '@/components/brand/logo';

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <LogoMark className="size-12 animate-breathe" />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Nothing here, just quiet</h1>
        <p className="text-muted-foreground">The page you were looking for has moved or doesn’t exist.</p>
      </div>
      <Button asChild>
        <Link href="/home">Return home</Link>
      </Button>
    </main>
  );
}
