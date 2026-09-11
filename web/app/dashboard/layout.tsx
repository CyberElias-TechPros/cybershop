import { requireVendor } from '@/lib/session';
import { api } from '@/lib/api';
import { categoryTheme } from '@/lib/theme';
import type { BusinessPageOut } from '@/lib/types';
import DashNav from '@/components/DashNav';
import type { CSSProperties } from 'react';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const me = await requireVendor();
  // Category theme morph: the vendor's own accent duet colours their panel,
  // mirroring their storefront (graceful fallback to the brand palette).
  let th = categoryTheme(null);
  try {
    if (me.business) {
      const page = await api<BusinessPageOut>(`/public/business/${me.business.slug}`);
      th = categoryTheme(page.business.categories);
    }
  } catch {
    /* default palette */
  }
  return (
    <div className="dash" style={{ ['--acc' as string]: th.acc, ['--acc2' as string]: th.acc2 } as CSSProperties}>
      <DashNav businessName={me.business?.name ?? ''} unread={me.unread_notifications} />
      <div className="dash-main">{children}</div>
    </div>
  );
}
