import type { ComponentType } from 'react';
import { BreatheIcon, ChartIcon, LotusIcon, SettingsIcon, WavesIcon } from './Icons';
import { cx } from './ui';

export type TabId = 'meditate' | 'breathe' | 'sounds' | 'progress' | 'settings';

export const TABS: { id: TabId; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { id: 'meditate', label: 'Meditate', Icon: LotusIcon },
  { id: 'breathe', label: 'Breathe', Icon: BreatheIcon },
  { id: 'sounds', label: 'Sounds', Icon: WavesIcon },
  { id: 'progress', label: 'Progress', Icon: ChartIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];

/** Bottom bar on phones; a floating pill along the top on wider screens. */
export function TabBar({ current, onChange }: { current: TabId; onChange: (tab: TabId) => void }) {
  return (
    <nav
      aria-label="Main"
      className={cx(
        'fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md',
        'md:sticky md:top-4 md:bottom-auto md:mx-auto md:mt-4 md:w-fit md:rounded-full md:border md:px-2 md:pb-0 md:shadow-sm',
      )}
    >
      <ul className="mx-auto flex max-w-lg md:max-w-none md:gap-1">
        {TABS.map(({ id, label, Icon }) => {
          const selected = id === current;
          return (
            <li key={id} className="flex-1 md:flex-none">
              <a
                href={`#${id}`}
                aria-current={selected ? 'page' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  onChange(id);
                }}
                className={cx(
                  'flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 text-xs font-medium transition-colors',
                  'md:min-h-12 md:flex-row md:gap-2 md:rounded-full md:px-4 md:text-sm',
                  selected ? 'text-accent md:bg-accent-soft' : 'text-muted hover:text-ink',
                )}
              >
                <span
                  className={cx(
                    'grid h-8 w-14 place-items-center rounded-full transition-colors md:h-auto md:w-auto',
                    selected && 'bg-accent-soft md:bg-transparent',
                  )}
                >
                  <Icon size={22} />
                </span>
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
