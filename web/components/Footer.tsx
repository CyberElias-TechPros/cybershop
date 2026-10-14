import { siteInfo } from '@/lib/site';
import { api, TAXONOMY_REVALIDATE } from '@/lib/api';
import type { HomeOut } from '@/lib/types';
import FooterClient from './FooterClient';

/**
 * Footer (server) — pulls live platform settings (support email + trust copy)
 * so the contact surface and the safety line are admin-configurable, plus the
 * category list (grouped in the footer like everywhere else), then hands off
 * to the (client) copy-to-clipboard bits.
 */
export default async function Footer() {
  const site = await siteInfo();
  let categories: { name: string; slug: string; icon: string | null }[] = [];
  try {
    const home = await api<HomeOut>('/public/home', { revalidate: TAXONOMY_REVALIDATE });
    categories = (home.categories ?? []).slice(0, 6);
  } catch {
    /* footer renders fine without the category group */
  }
  return <FooterClient supportEmail={site.support_email} safety={site.safety.notice} categories={categories} />;
}
