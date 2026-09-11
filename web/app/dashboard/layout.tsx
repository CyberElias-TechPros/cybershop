import { requireVendor } from '@/lib/session';
import DashNav from '@/components/DashNav';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const me = await requireVendor();
  return (
    <div className="dash">
      <DashNav businessName={me.business?.name ?? ''} unread={me.unread_notifications} />
      <div className="dash-main">{children}</div>
    </div>
  );
}
