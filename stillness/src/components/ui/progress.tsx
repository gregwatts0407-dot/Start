import { cn } from '@/lib/utils';

interface ProgressProps {
  value: number;
  label: string;
  className?: string;
  tone?: 'sage' | 'gold';
}

export function Progress({ value, label, className, tone = 'sage' }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-700 ease-out', tone === 'gold' ? 'bg-gold' : 'bg-sage')}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
