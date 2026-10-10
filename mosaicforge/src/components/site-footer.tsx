import { ASSET_PREFIX } from "@/lib/env";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>MosaicForge — progress is stored locally in your browser.</p>
        <p>
          Images: CC0, public-domain, Unsplash and CC BY-SA works.{" "}
          <a href={`${ASSET_PREFIX}images/CREDITS.md`} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">
            Credits
          </a>
        </p>
      </div>
    </footer>
  );
}
