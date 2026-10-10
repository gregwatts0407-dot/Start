import { Droplets, Lock, Save, Sparkles } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Gallery } from "@/components/gallery/gallery";
import { ThemeToggle } from "@/components/theme-toggle";

const FEATURES = [
  { icon: Lock, title: "Region locking", text: "Paint stays inside its numbered region, with magnetic, softly anti-aliased edges." },
  { icon: Droplets, title: "True watercolour", text: "Wet-in-wet bleeding, granulating pigment, pooled edges and cold-press paper." },
  { icon: Save, title: "Saves as you go", text: "Progress is kept on this device, so you can return to a painting any time." },
];

export default function Home() {
  return (
    <div className="paper-texture min-h-dvh">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="mx-auto flex max-w-7xl flex-col gap-12 px-4 pb-20 sm:px-6 lg:px-8">
        <section className="grid items-end gap-8 pt-6 lg:grid-cols-[1.2fr_1fr] lg:pt-12">
          <div className="flex flex-col gap-5">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              <Sparkles className="size-3.5 text-gold" /> A meditative paint-by-numbers studio
            </span>
            <h1 className="font-display text-4xl leading-[1.05] font-medium tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Paint by numbers, <em className="font-normal text-primary not-italic sm:italic">in true watercolour.</em>
            </h1>
            <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
              Choose a canvas, pick up a brush and let the pigment do the rest. Every wash blooms, settles and dries
              like real paint on textured paper – while the numbers keep each stroke exactly where it belongs.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3 rounded-xl border bg-card/60 p-4 backdrop-blur-sm">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-sm text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <Gallery />
      </main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        AquaNumerica · Paintings are saved locally in your browser.
      </footer>
    </div>
  );
}
