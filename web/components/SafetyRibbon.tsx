import { siteInfo } from '@/lib/site';
import SafetyRibbonClient from './SafetyRibbonClient';

/**
 * Server half of the site-wide safety ribbon: pulls the admin-editable copy
 * (`platform_settings.safety`) and hands it to the dismissible client bar.
 * Fails closed — if the catalogue is unreachable the defaults still render.
 */
export default async function SafetyRibbon() {
  const { safety } = await siteInfo();
  if (!safety.enabled) return null;
  return <SafetyRibbonClient headline={safety.headline} notice={safety.notice} tips={safety.tips} />;
}
