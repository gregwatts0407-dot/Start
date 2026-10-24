import { StudioNav } from '@/components/studio/studio-nav';
import { requireRole } from '@/lib/data/session';

export const metadata = { title: { default: 'Studio', template: '%s · Studio · Stillness' } };

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  await requireRole(['instructor', 'admin']);
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Instructor studio</p>
      <StudioNav />
      {children}
    </div>
  );
}
