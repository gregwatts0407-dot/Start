import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { MinusIcon, PlusIcon } from './Icons';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-3xl bg-surface p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 ring-line', className)}>
      {children}
    </section>
  );
}

export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
      {children}
    </h2>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-accent text-accent-ink hover:brightness-105 active:brightness-95',
    secondary: 'bg-surface-2 text-ink hover:brightness-[0.98] active:brightness-95',
    ghost: 'bg-transparent text-ink hover:bg-surface-2',
    danger: 'bg-transparent text-danger ring-1 ring-current hover:bg-surface-2',
  };
  return (
    <button
      type="button"
      className={cx(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 font-medium transition disabled:opacity-50',
        styles[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** A row of pill-shaped radio buttons. */
export function ChoiceChips<T extends string | number>({
  label,
  value,
  options,
  onChange,
  hideLabel,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; ariaLabel?: string }[];
  onChange: (value: T) => void;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-labelledby={id}>
      <div id={id} className={hideLabel ? 'sr-only' : 'mb-2 text-sm font-medium text-muted'}>
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={option.ariaLabel}
              onClick={() => onChange(option.value)}
              className={cx(
                'min-h-11 min-w-11 rounded-full px-4 text-[15px] font-medium transition',
                selected
                  ? 'bg-accent text-accent-ink shadow-sm'
                  : 'bg-surface-2 text-ink hover:brightness-[0.97]',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-12 items-center justify-between gap-4">
      <div>
        <div id={id} className="font-medium">
          {label}
        </div>
        {description && <div className="text-sm text-muted">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-8 w-14 shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-surface-2 ring-1 ring-line',
        )}
      >
        <span
          className={cx(
            'absolute top-1 left-1 h-6 w-6 rounded-full shadow transition-transform',
            checked ? 'translate-x-6 bg-accent-ink' : 'bg-muted',
          )}
        />
      </button>
    </div>
  );
}

export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  format = (v) => `${Math.round(v * 100)}%`,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (value: number) => string;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        <span className="text-muted tabular-nums">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-12 items-center justify-between gap-4">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <select
        id={id}
        value={String(value)}
        onChange={(e) => {
          const match = options.find((o) => String(o.value) === e.target.value);
          if (match) onChange(match.value);
        }}
        className="min-h-11 rounded-full bg-surface-2 px-4 text-[15px] text-ink"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit: string;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)));
  const id = useId();
  return (
    <div className="flex min-h-12 items-center justify-between gap-3">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => set(value - step)}
          disabled={value <= min}
          aria-label={`Decrease ${label.toLowerCase()}`}
          className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 disabled:opacity-40"
        >
          <MinusIcon size={20} />
        </button>
        <div className="flex items-baseline">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) set(v);
            }}
            className="w-14 bg-transparent text-center text-lg font-semibold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-sm text-muted">{unit}</span>
        </div>
        <button
          type="button"
          onClick={() => set(value + step)}
          disabled={value >= max}
          aria-label={`Increase ${label.toLowerCase()}`}
          className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 disabled:opacity-40"
        >
          <PlusIcon size={20} />
        </button>
      </div>
    </div>
  );
}
