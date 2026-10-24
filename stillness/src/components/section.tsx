import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionProps {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
  className?: string;
}

export function Section({ title, description, href, linkLabel = 'See all', children, className }: SectionProps) {
  return (
    <section className={cn('space-y-4', className)} aria-label={title}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {href && (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 rounded-full text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {linkLabel} <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Horizontal scroller on mobile that becomes a grid on larger screens. */
export function CardRail({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4 [&>*]:w-[70%] [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-auto',
        className,
      )}
    >
      {children}
    </div>
  );
}
