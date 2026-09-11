import { requireAdmin } from '@/lib/session';
import DashNav from '@/components/DashNav';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAdmin();
  return (
    <div className="dash">
      <DashNav businessName="" unread={0} isAdmin />
      <div className="dash-main">
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 14px' }}>
          Admin · {me.user.name} ({me.user.email})
        </p>
        {children}
      </div>
    </div>
  );
}
