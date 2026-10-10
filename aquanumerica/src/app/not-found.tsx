import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <div className="paper-texture flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <LogoMark className="size-12" />
      <h1 className="font-display text-3xl font-medium">This canvas has washed away</h1>
      <p className="max-w-md text-muted-foreground">We couldn&apos;t find that painting. Choose another from the gallery.</p>
      <Button asChild>
        <Link href="/">Back to the gallery</Link>
      </Button>
    </div>
  );
}
