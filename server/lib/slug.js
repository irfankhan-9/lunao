// Deterministic, URL-safe slug derived from a business name (+ optional city).
export function slugify(name, city = '') {
  const base = `${name || 'site'}`
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const cityPart = city
    ? '-' +
      city
        .toLowerCase()
        .split(',')[0]
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    : '';

  let slug = `${base}${cityPart}`.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
  if (slug.length > 60) {
    slug = slug.slice(0, 60).replace(/-+$/g, '');
  }
  return slug || `site-${Math.random().toString(36).slice(2, 8)}`;
}
