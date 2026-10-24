import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-4 rounded-3xl border border-dashed px-6 py-12 text-center', className)}>
      <div className="relative size-14" aria-hidden>
        <span className="absolute inset-0 animate-breathe rounded-full bg-secondary" />
        <span className="absolute inset-[30%] rounded-full bg-sage/60" />
      </div>
      <div className="space-y-1.5">
        <p className="font-display text-lg font-medium">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
