// Browser-side client for the unified Lunao template registry.
//
// One consistent shape for every template the dashboard knows about:
//   - built-in (e.g. "barber-dark-luxury")
//   - custom upload (e.g. "tmpl_xxx")
//   - AI-generated (also "tmpl_xxx")
//   - Studio history "convert to template" (also "tmpl_xxx")
//
// The picker, the deploy wizard, the campaign cards, the editor, and the
// Template Lab all consume this list so they always agree.

export interface TemplateSummary {
  // Unified template key. Use this in every API payload that references
  // a template (campaigns.run templateKey, sites editor, etc.).
  key: string;
  source: 'builtin' | 'custom';
  name: string;
  niche: string;
  // Built-in: relative URL the iframe can `src` directly.
  // Custom: relative URL the iframe can `src` directly.
  previewPath: string;
  // Built-in only — the raw file name under /public/templates-raw/.
  // Custom templates are not backed by a static file.
  rawFile?: string | null;
  emoji?: string;
  tag?: string;
  description?: string;
  isFeatured?: boolean;
  // Custom only:
  categoryId?: string | null;
  slug?: string;
  styleTags?: string;
  usedCount?: number;
  createdAt?: number;
  ownerKey?: string;
}

export interface TemplateListResponse {
  builtins: TemplateSummary[];
  customs: TemplateSummary[];
  all: TemplateSummary[];
}

export interface TemplateDetailResponse {
  template: TemplateSummary;
}

const API_BASE = '';

// Fetch the unified list (built-ins + this user's customs).
export async function listAllTemplates(ownerKey?: string): Promise<TemplateListResponse> {
  const qs = ownerKey ? `?ownerKey=${encodeURIComponent(ownerKey)}` : '';
  const res = await fetch(`${API_BASE}/api/templates${qs}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to load templates (${res.status})`);
  }
  const data = await res.json();
  return {
    builtins: data.builtins || [],
    customs: data.customs || [],
    all: data.all || [],
  };
}

// Resolve a single template descriptor (without HTML body).
export async function getTemplate(key: string, ownerKey?: string): Promise<TemplateSummary | null> {
  try {
    const qs = ownerKey ? `?ownerKey=${encodeURIComponent(ownerKey)}` : '';
    const res = await fetch(`${API_BASE}/api/templates/${encodeURIComponent(key)}${qs}`);
    if (res.status === 404) return null;
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to load template (${res.status})`);
    }
    const data: TemplateDetailResponse = await res.json();
    return data.template;
  } catch {
    return null;
  }
}

// Fetch the niche list derived from the built-in registry.
// (Pure-static for the picker; mirrors src/data.ts nicheList as fallback.)
export async function listNiches(): Promise<{ id: string; label: string; emoji: string }[]> {
  try {
    const res = await fetch(`${API_BASE}/api/niches`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.niches || [];
  } catch {
    return [];
  }
}
