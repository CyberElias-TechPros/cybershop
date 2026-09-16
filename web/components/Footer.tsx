import { api } from '@/lib/api';
import FooterClient from './FooterClient';

/**
 * Footer (server) — pulls live platform settings (support email) so the
 * contact surface is admin-configurable, then hands off to the (client)
 * copy-to-clipboard bits.
 */
export default async function Footer() {
  let supportEmail = 'support@cybershop.ng';
  try {
    const d = await api<{ site: { support_email: string } }>('/public/site');
    if (d.site?.support_email) supportEmail = d.site.support_email;
  } catch {
    /* keep default */
  }
  return <FooterClient supportEmail={supportEmail} />;
}
