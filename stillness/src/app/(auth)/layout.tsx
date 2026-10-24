import { Artwork } from '@/components/brand/artwork';
import { Logo } from '@/components/brand/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <main id="main" className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">{children}</div>
      </main>
      <Artwork palette="dusk" seed="stillness-auth" className="hidden lg:block">
        <div className="absolute inset-0 flex items-end p-12">
          <blockquote className="max-w-md text-white">
            <p className="font-display text-3xl leading-snug">“Feelings come and go like clouds in a windy sky. Conscious breathing is my anchor.”</p>
            <footer className="mt-4 text-sm text-white/70">— Thích Nhất Hạnh</footer>
          </blockquote>
        </div>
      </Artwork>
    </div>
  );
}
