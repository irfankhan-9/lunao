function extractCanonicalSiteSlug(slug, siteUrl) {
  if (slug && typeof slug === 'string') {
    let clean = slug.toLowerCase().trim().replace(/^https?:\/\//, '').split('?')[0].split('#')[0];
    if (clean.includes('lunao.org')) {
      if (clean.includes('.lunao.org')) {
        const sub = clean.split('.lunao.org')[0];
        if (sub && sub !== 'www' && sub !== 'api') return sub.replace(/^\/+|\/+$/g, '');
      }
      const parts = clean.split('/').filter(Boolean);
      const last = parts[parts.length - 1];
      if (last && !last.includes('lunao.org')) return last.replace(/\.html$/, '');
    } else {
      const parts = clean.split('/').filter(Boolean);
      const last = parts[parts.length - 1] || clean;
      return last.replace(/\.html$/, '').replace(/^\/+|\/+$/g, '');
    }
  }
  if (siteUrl && typeof siteUrl === 'string') {
    let clean = siteUrl.toLowerCase().trim().replace(/^https?:\/\//, '').split('?')[0].split('#')[0];
    if (clean.includes('.lunao.org')) {
      const sub = clean.split('.lunao.org')[0];
      if (sub && sub !== 'www' && sub !== 'api') return sub.replace(/^\/+|\/+$/g, '');
    }
    const parts = clean.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last.replace(/\.html$/, '');
  }
  return '';
}

console.log("1:", extractCanonicalSiteSlug("winnipeg-roofers-inc-winnipeg", "https://winnipeg-roofers-inc-winnipeg.lunao.org"));
console.log("2:", extractCanonicalSiteSlug(null, "https://winnipeg-roofers-inc-winnipeg.lunao.org"));
console.log("3:", extractCanonicalSiteSlug(undefined, "https://winnipeg-roofers-inc-winnipeg.lunao.org"));
console.log("4:", extractCanonicalSiteSlug("https://winnipeg-roofers-inc-winnipeg.lunao.org", "https://winnipeg-roofers-inc-winnipeg.lunao.org"));
