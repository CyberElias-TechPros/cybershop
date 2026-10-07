import { siteInfo } from '@/lib/site';
import FooterClient from './FooterClient';

/**
 * Footer (server) — pulls live platform settings (support email + trust copy)
 * so the contact surface and the safety line are admin-configurable, then
 * hands off to the (client) copy-to-clipboard bits.
 */
export default async function Footer() {
  const site = await siteInfo();
  return <FooterClient supportEmail={site.support_email} safety={site.safety.notice} />;
}
