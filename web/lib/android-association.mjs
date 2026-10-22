/** @param {Record<string,string|undefined>} env */
export function assetLinksResponse(env) {
  const unavailable = () => Response.json({ error: 'Android domain association is not configured.' },
    { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '300', 'X-Content-Type-Options': 'nosniff' } });
  try {
    if (!env.ANDROID_ASSETLINKS || env.ANDROID_ASSETLINKS.length > 16384) return unavailable();
    const site = new URL(env.SITE_URL || '');
    if (site.protocol !== 'https:' || site.username || site.password || site.port || site.pathname !== '/' || site.search || site.hash) return unavailable();
    const entries = JSON.parse(env.ANDROID_ASSETLINKS);
    if (!Array.isArray(entries) || !entries.length || entries.length > 5) return unavailable();
    const seen = new Set();
    const debugAllowed = env.ANDROID_ASSOCIATION_ENV === 'staging' && site.hostname !== 'cybershop.ng' && site.hostname !== 'www.cybershop.ng' && site.hostname !== 'shop.freegameplay.site';
    const result = [];
    for (const entry of entries) {
      if (!entry || typeof entry.package_name !== 'string' || !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(entry.package_name) || seen.has(entry.package_name)) return unavailable();
      if (!debugAllowed && /(^|\.)(debug|staging|test)(\.|$)/.test(entry.package_name)) return unavailable();
      const fingerprints = entry.sha256_cert_fingerprints;
      if (!Array.isArray(fingerprints) || !fingerprints.length || fingerprints.length > 5 || fingerprints.some((value) => typeof value !== 'string' || !/^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(value) || new Set(value.toUpperCase().split(':')).size === 1)) return unavailable();
      seen.add(entry.package_name);
      result.push({ relation: ['delegate_permission/common.handle_all_urls'], target: {
        namespace: 'android_app', package_name: entry.package_name,
        sha256_cert_fingerprints: [...new Set(fingerprints.map((value) => value.toUpperCase()))],
      } });
    }
    return Response.json(result, { headers: { 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return unavailable(); }
}
