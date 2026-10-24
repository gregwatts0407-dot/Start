'use client';

import { Button } from '@/components/ui/button';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="flex min-h-[60dvh] flex-col items-center justify-center gap-5 px-6 text-center">
      <h1 className="text-2xl font-semibold">Something interrupted the stillness</h1>
      <p className="max-w-md text-muted-foreground">
        We couldn’t load this page. Take a breath and try again — if it keeps happening, please let us know.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
