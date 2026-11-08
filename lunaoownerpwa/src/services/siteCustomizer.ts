/**
 * High-Speed Structured Website Customizer Engine for Owner PWA
 */

export interface SiteCustomFields {
  businessName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  heroImage: string;
  logo: string;
  headline: string;
  description: string;
}

export function extractFieldsFromHtml(
  html: string,
  fallback?: { name?: string; city?: string; phone?: string }
): SiteCustomFields {
  const fields: SiteCustomFields = {
    businessName: fallback?.name || '',
    phone: fallback?.phone || '',
    email: '',
    address: '',
    city: fallback?.city || '',
    heroImage: '',
    logo: '',
    headline: '',
    description: '',
  };

  if (!html || typeof html !== 'string') return fields;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const title = doc.title || '';
    if (title) {
      const cleanTitle = title
        .replace(/\s*[-|–—]\s*(Official Website|Home|Services|Austin|Texas|NYC|TX|Top Rated|Local).*$/i, '')
        .trim();
      if (cleanTitle && cleanTitle.length > 2) {
        fields.businessName = cleanTitle;
      }
    }
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
    if (ogTitle && ogTitle.trim()) {
      fields.businessName = ogTitle.trim();
    }
    const brandEl = doc.querySelector('.brand-name, .logo-text, .site-title, [data-brand-name]');
    if (brandEl?.textContent?.trim()) {
      fields.businessName = brandEl.textContent.trim();
    }

    const telLink = doc.querySelector('a[href^="tel:"]');
    if (telLink) {
      const rawHref = telLink.getAttribute('href') || '';
      const text = telLink.textContent?.trim() || '';
      fields.phone = text || rawHref.replace(/^tel:\s*/i, '');
    }
    const phoneEl = doc.querySelector('.phone-display, .contact-phone, .header-phone');
    if (phoneEl?.textContent?.trim()) {
      fields.phone = phoneEl.textContent.trim();
    }

    const mailLink = doc.querySelector('a[href^="mailto:"]');
    if (mailLink) {
      const rawMail = mailLink.getAttribute('href') || '';
      fields.email = rawMail.replace(/^mailto:\s*/i, '').trim();
    }
    const emailEl = doc.querySelector('.contact-email, .business-email');
    if (emailEl?.textContent?.trim() && emailEl.textContent.includes('@')) {
      fields.email = emailEl.textContent.trim();
    }

    const addrEl = doc.querySelector('address, .business-address, .contact-address, [data-address]');
    if (addrEl?.textContent?.trim()) {
      fields.address = addrEl.textContent.trim();
      const parts = fields.address.split(',');
      if (parts.length >= 2 && !fields.city) {
        fields.city = parts[parts.length - 2].trim();
      }
    }

    const h1El = doc.querySelector('main h1, .hero h1, header h1, h1');
    if (h1El?.textContent?.trim()) {
      fields.headline = h1El.textContent.trim();
    }

    const descMeta = doc.querySelector('meta[name="description"]')?.getAttribute('content');
    if (descMeta && descMeta.trim()) {
      fields.description = descMeta.trim();
    } else {
      const heroP = doc.querySelector('.hero p, header p, .hero-subtitle, .lead, main p');
      if (heroP?.textContent?.trim() && heroP.textContent.trim().length > 15) {
        fields.description = heroP.textContent.trim();
      }
    }

    const heroImg = doc.querySelector('#heroImage, .hero-img, .hero-image, .hero img, header img');
    if (heroImg) {
      const src = heroImg.getAttribute('src');
      if (src && !src.startsWith('data:image/svg')) {
        fields.heroImage = src;
      }
    }

    const logoImg = doc.querySelector('.brand-logo img, .site-logo img, .navbar-brand img, img.logo');
    if (logoImg) {
      const src = logoImg.getAttribute('src');
      if (src) {
        fields.logo = src;
      }
    }
  } catch (err) {
    console.warn('[extractFieldsFromHtml] warning:', err);
  }

  return fields;
}

export function applyFieldsToHtml(baseHtml: string, fields: Partial<SiteCustomFields>): string {
  if (!baseHtml || typeof baseHtml !== 'string') return '';

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(baseHtml, 'text/html');

    if (fields.businessName && fields.businessName.trim()) {
      const name = fields.businessName.trim();
      if (doc.title) {
        doc.title = `${name} - Official Website`;
      }
      const ogTitle = doc.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute('content', name);

      doc.querySelectorAll('.brand-name, .business-name, .logo-text, .site-title, [data-brand-name]').forEach((el) => {
        el.textContent = name;
      });
    }

    if (fields.phone && fields.phone.trim()) {
      const phoneDisplay = fields.phone.trim();
      const rawDigits = phoneDisplay.replace(/\D/g, '');
      const cleanTel = (phoneDisplay.startsWith('+') ? '+' : '') + rawDigits;

      doc.querySelectorAll('a[href^="tel:"]').forEach((el) => {
        el.setAttribute('href', `tel:${cleanTel || '5550000'}`);
        if (/\d{3}/.test(el.textContent || '')) {
          el.textContent = phoneDisplay;
        }
      });

      doc.querySelectorAll('.phone-display, .contact-phone, .header-phone').forEach((el) => {
        el.textContent = phoneDisplay;
      });
    }

    if (fields.email && fields.email.trim()) {
      const email = fields.email.trim();
      doc.querySelectorAll('a[href^="mailto:"]').forEach((el) => {
        el.setAttribute('href', `mailto:${email}`);
        if (el.textContent?.includes('@')) {
          el.textContent = email;
        }
      });

      doc.querySelectorAll('.contact-email, .business-email').forEach((el) => {
        el.textContent = email;
      });
    }

    if (fields.address && fields.address.trim()) {
      const address = fields.address.trim();
      doc.querySelectorAll('address, .business-address, .contact-address, [data-address]').forEach((el) => {
        el.textContent = address;
      });
    }

    if (fields.headline && fields.headline.trim()) {
      const headline = fields.headline.trim();
      const mainH1 = doc.querySelector('main h1, .hero h1, header h1, h1');
      if (mainH1) {
        mainH1.textContent = headline;
      }
    }

    if (fields.description && fields.description.trim()) {
      const desc = fields.description.trim();
      const heroP = doc.querySelector('.hero p, header p, .hero-subtitle, .lead, main p');
      if (heroP) {
        heroP.textContent = desc;
      }
      const metaDesc = doc.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute('content', desc);
      }
    }

    if (fields.heroImage && fields.heroImage.trim()) {
      const heroUrl = fields.heroImage.trim();
      const heroImg = doc.querySelector('#heroImage, .hero-img, .hero-image, .hero img, header img');
      if (heroImg) {
        heroImg.setAttribute('src', heroUrl);
        heroImg.removeAttribute('srcset');
      }

      const heroSec = doc.querySelector('.hero, header.hero, .hero-section');
      if (heroSec && heroSec.getAttribute('style')?.includes('background-image')) {
        const updatedStyle = heroSec
          .getAttribute('style')!
          .replace(/url\(['"]?[^'"]+['"]?\)/, `url('${heroUrl}')`);
        heroSec.setAttribute('style', updatedStyle);
      }
    }

    if (fields.logo && fields.logo.trim()) {
      const logoUrl = fields.logo.trim();
      const logoImg = doc.querySelector('.brand-logo img, .site-logo img, .navbar-brand img, img.logo');
      if (logoImg) {
        logoImg.setAttribute('src', logoUrl);
      }
    }

    const rawOut = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    return rawOut.replace(/\s*style="outline:\s*2px\s*dashed\s*rgba\(37,\s*99,\s*235,\s*0\.6\);\s*cursor:\s*pointer;"/gi, '');
  } catch (err) {
    console.warn('[applyFieldsToHtml] warning:', err);
    return baseHtml;
  }
}

export async function uploadPwaPhoto(
  fileOrBase64: File | string,
  filename?: string
): Promise<{ ok: boolean; url: string; error?: string }> {
  try {
    let base64Data = '';
    let resolvedName = filename || 'photo.jpg';

    if (typeof fileOrBase64 === 'string') {
      base64Data = fileOrBase64;
    } else {
      resolvedName = fileOrBase64.name || resolvedName;
      base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(fileOrBase64);
      });
    }

    const token = typeof localStorage !== 'undefined' ? (localStorage.getItem('lunao_pwa_token') || '') : '';
    const resp = await fetch('/api/pwa/upload/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({
        image: base64Data,
        filename: resolvedName,
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data?.url) {
        return { ok: true, url: data.url };
      }
    }

    const errData = await resp.json().catch(() => ({}));
    return { ok: false, url: '', error: errData.error || 'Photo upload failed.' };
  } catch (err: any) {
    return { ok: false, url: '', error: err.message || 'Photo upload failed.' };
  }
}
