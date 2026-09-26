import { requireUser } from '@/lib/session';
import AccountNav from '@/components/AccountNav';

export const dynamic = 'force-dynamic';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  return (
    <div className="dash">
      <AccountNav name={me.user.name} role={me.user.role} unread={me.unread_notifications} />
      <div className="dash-main">{children}</div>
    </div>
  );
}
