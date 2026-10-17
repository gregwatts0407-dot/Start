import { useState } from 'react';
import type { DayTotal } from '../lib/stats';
import { cx } from './ui';

/**
 * Minutes per day for the last seven days. A single series, so one hue,
 * no legend; values are revealed on hover/focus and the whole chart has a
 * screen-reader table.
 */
export function WeeklyChart({ days }: { days: DayTotal[] }) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(10, ...days.map((d) => d.minutes));
  const total = days.reduce((sum, d) => sum + d.minutes, 0);

  return (
    <figure>
      <figcaption className="mb-4 flex items-baseline justify-between">
        <span className="font-semibold">Last 7 days</span>
        <span className="text-sm text-muted tabular-nums">{total} min</span>
      </figcaption>
      <div className="relative flex h-40 items-end gap-2 border-b border-line" aria-hidden="true">
        {days.map((day) => {
          const height = day.minutes === 0 ? 0 : Math.max(4, (day.minutes / max) * 100);
          const showValue = active === day.key || (active === null && day.isToday && day.minutes > 0);
          return (
            <div
              key={day.key}
              className="relative flex h-full flex-1 items-end justify-center"
              onPointerEnter={() => setActive(day.key)}
              onPointerLeave={() => setActive(null)}
            >
              {showValue && (
                <span
                  className="absolute z-10 -translate-y-1 rounded-md bg-ink px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-bg tabular-nums"
                  style={{ bottom: `${height}%` }}
                >
                  {day.minutes}m
                </span>
              )}
              <div
                className={cx(
                  'w-full max-w-9 rounded-t-[4px] transition-[height] duration-500',
                  day.isToday ? 'bg-accent' : 'bg-accent/60',
                )}
                style={{ height: `${height}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2" aria-hidden="true">
        {days.map((day) => (
          <span
            key={day.key}
            className={cx('flex-1 text-center text-xs', day.isToday ? 'font-semibold text-ink' : 'text-muted')}
          >
            {day.isToday ? 'Today' : day.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Minutes meditated over the last 7 days</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Minutes</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.key}>
              <th scope="row">{day.isToday ? 'Today' : day.label}</th>
              <td>{day.minutes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
