import { useState, useEffect, useCallback } from 'react';
import { Template } from '../types';
import { initialTemplates } from '../data';

export interface NicheItem {
  id: string;
  label: string;
  emoji: string;
  color?: string;
}

export const DEFAULT_NICHES: NicheItem[] = [
  { id: 'Barber', emoji: '💈', label: 'Barber', color: '#2563EB' },
  { id: 'Salon', emoji: '💅', label: 'Salon', color: '#EC4899' },
  { id: 'Dentist', emoji: '🦷', label: 'Dentist', color: '#0EA5E9' },
  { id: 'HVAC', emoji: '❄️', label: 'HVAC', color: '#0D9488' },
  { id: 'Gym', emoji: '💪', label: 'Gym', color: '#EF4444' },
  { id: 'Roofing', emoji: '🏠', label: 'Roofing', color: '#F97316' },
  { id: 'Real Estate', emoji: '🏡', label: 'Real Estate', color: '#10B981' },
];

export function getNicheEmoji(niche: string): string {
  const n = String(niche || '').toLowerCase();
  if (n.includes('barber')) return '💈';
  if (n.includes('salon') || n.includes('hair') || n.includes('beauty') || n.includes('spa')) return '💅';
  if (n.includes('dent')) return '🦷';
  if (n.includes('hvac') || n.includes('cool') || n.includes('heat') || n.includes('air')) return '❄️';
  if (n.includes('gym') || n.includes('fit') || n.includes('workout')) return '💪';
  if (n.includes('roof')) return '🏠';
  if (n.includes('real') || n.includes('estate') || n.includes('realt') || n.includes('broker')) return '🏡';
  if (n.includes('plumb')) return '🔧';
  if (n.includes('clean')) return '🧹';
  if (n.includes('auto') || n.includes('car')) return '🚗';
  if (n.includes('pet') || n.includes('dog') || n.includes('cat') || n.includes('vet')) return '🐾';
  if (n.includes('rest') || n.includes('cafe') || n.includes('food')) return '🍽️';
  if (n.includes('law') || n.includes('legal')) return '⚖️';
  if (n.includes('acc') || n.includes('tax') || n.includes('cpa')) return '📊';
  return '';
}

const STORAGE_NICHES = 'lunao_synced_niches';
const STORAGE_TEMPLATES = 'lunao_synced_templates';

// Retrieve cached niches or defaults
export function getLocalNiches(): NicheItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_NICHES);
    if (!raw) return DEFAULT_NICHES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_NICHES;
    // Ensure all default niches exist in the array
    const map = new Map<string, NicheItem>();
    for (const d of DEFAULT_NICHES) map.set(d.id.toLowerCase(), d);
    for (const item of parsed) {
      if (item && item.id) {
        map.set(item.id.toLowerCase(), {
          id: item.id,
          label: item.label || item.id,
          emoji: item.emoji || getNicheEmoji(item.id),
          color: item.color || '#2563EB',
        });
      }
    }
    return Array.from(map.values());
  } catch {
    return DEFAULT_NICHES;
  }
}

// Retrieve cached templates or defaults
export function getLocalTemplates(): Template[] {
  try {
    const raw = localStorage.getItem(STORAGE_TEMPLATES);
    if (!raw) return initialTemplates;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return initialTemplates;
    const map = new Map<string, Template>();
    for (const t of initialTemplates) map.set(t.id, t);
    for (const t of parsed) {
      if (t && t.id) map.set(t.id, t);
    }
    return Array.from(map.values());
  } catch {
    return initialTemplates;
  }
}

// Fetch niches from the backend and notify all components
export async function fetchNichesFromBackend(): Promise<NicheItem[]> {
  try {
    const res = await fetch('/api/niches');
    if (!res.ok) return getLocalNiches();
    const data = await res.json();
    if (data.ok && Array.isArray(data.niches)) {
      const map = new Map<string, NicheItem>();
      // 1. Defaults
      for (const d of DEFAULT_NICHES) map.set(d.id.toLowerCase(), d);
      // 2. Previously cached custom niches in localStorage
      for (const l of getLocalNiches()) map.set(l.id.toLowerCase(), l);
      // 3. Backend niches (can be array of strings or objects)
      for (const n of data.niches) {
        const id = typeof n === 'string' ? n.trim() : String(n.id || n.name || '').trim();
        if (id) {
          map.set(id.toLowerCase(), {
            id,
            label: typeof n === 'string' ? id : (n.label || id),
            emoji: typeof n === 'string' ? getNicheEmoji(id) : (n.emoji || getNicheEmoji(id)),
            color: typeof n === 'string' ? '#2563EB' : (n.color || '#2563EB'),
          });
        }
      }
      const merged = Array.from(map.values());
      localStorage.setItem(STORAGE_NICHES, JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent('lunao:niches-sync', { detail: merged }));
      return merged;
    }
  } catch (err) {
    console.warn('[nichesSync] failed to fetch niches from backend:', err);
  }
  return getLocalNiches();
}

// Save a newly created niche to backend and synchronize
export async function createAndSyncNiche(name: string, emoji?: string, color = '#2563EB'): Promise<NicheItem> {
  const cleanName = name.trim();
  if (!cleanName) return { id: 'General', label: 'General', emoji: '', color: '#2563EB' };
  // Default to empty string (no magic emoji or artificial decorations)
  const resolvedEmoji = emoji !== undefined ? emoji : '';
  const newNiche: NicheItem = {
    id: cleanName,
    label: cleanName,
    emoji: resolvedEmoji,
    color,
  };

  // Optimistically update local
  const current = getLocalNiches();
  const exists = current.some((n) => n.id.toLowerCase() === cleanName.toLowerCase());
  const updated = exists ? current : [...current, newNiche];
  localStorage.setItem(STORAGE_NICHES, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent('lunao:niches-sync', { detail: updated }));

  // Post to backend
  try {
    const res = await fetch('/api/niches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cleanName, emoji: resolvedEmoji, color }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ok && Array.isArray(data.niches)) {
        const map = new Map<string, NicheItem>();
        for (const d of DEFAULT_NICHES) map.set(d.id.toLowerCase(), d);
        for (const u of updated) map.set(u.id.toLowerCase(), u);
        for (const n of data.niches) {
          const id = typeof n === 'string' ? n.trim() : String(n.id || n.name || '').trim();
          if (id) {
            map.set(id.toLowerCase(), {
              id,
              label: typeof n === 'string' ? id : (n.label || id),
              emoji: typeof n === 'string' ? '' : (n.emoji || ''),
              color: typeof n === 'string' ? '#2563EB' : (n.color || '#2563EB'),
            });
          }
        }
        const synced = Array.from(map.values());
        localStorage.setItem(STORAGE_NICHES, JSON.stringify(synced));
        window.dispatchEvent(new CustomEvent('lunao:niches-sync', { detail: synced }));
      }
    }
  } catch (err) {
    console.warn('[nichesSync] failed to post new niche to backend:', err);
  }

  return newNiche;
}

// Fetch templates from the backend and notify all components
export async function fetchTemplatesFromBackend(): Promise<Template[]> {
  try {
    const res = await fetch('/api/templates');
    if (!res.ok) return getLocalTemplates();
    const data = await res.json();
    if (data.ok && Array.isArray(data.all)) {
      const map = new Map<string, Template>();
      // 1. Initial builtins
      for (const t of initialTemplates) map.set(t.id, t);
      // 2. Previously saved local templates
      for (const l of getLocalTemplates()) map.set(l.id, l);
      // 3. Server templates
      for (const t of data.all) {
        const id = t.id || t.key;
        if (id) {
          map.set(id, {
            id,
            name: t.name || 'Custom Template',
            niche: t.niche || 'General',
            usedCount: t.usedCount || 0,
            rating: t.rating || 4.9,
            tag: t.tag || 'Custom Template',
            isMostUsed: Boolean(t.isMostUsed),
            emoji: t.emoji || getNicheEmoji(t.niche),
            description: t.description || `Custom website template designed for ${t.niche}.`,
          });
        }
      }
      const merged = Array.from(map.values());
      localStorage.setItem(STORAGE_TEMPLATES, JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent('lunao:templates-sync', { detail: merged }));
      return merged;
    }
  } catch (err) {
    console.warn('[nichesSync] failed to fetch templates from backend:', err);
  }
  return getLocalTemplates();
}

// Add or update a template and synchronize across all tabs
export function addAndSyncTemplate(template: { id: string; name: string; niche: string; tag?: string; description?: string }): Template {
  const newTpl: Template = {
    id: template.id,
    name: template.name,
    niche: template.niche,
    usedCount: 1,
    rating: 4.9,
    tag: template.tag || 'Custom Template',
    isMostUsed: false,
    emoji: getNicheEmoji(template.niche),
    description: template.description || `High-converting modern website template for ${template.niche}.`,
  };

  const current = getLocalTemplates();
  const exists = current.findIndex((t) => t.id === newTpl.id || t.name.toLowerCase() === newTpl.name.toLowerCase());
  const updated = exists >= 0 ? current.map((t, idx) => (idx === exists ? newTpl : t)) : [newTpl, ...current];

  localStorage.setItem(STORAGE_TEMPLATES, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent('lunao:templates-sync', { detail: updated }));

  // Ensure niche is created and synced across the whole platform
  if (template.niche && template.niche !== 'All' && template.niche !== 'General') {
    createAndSyncNiche(template.niche);
  }

  return newTpl;
}

// Reassign / move a template from one niche to another
export function moveAndSyncTemplate(template: { id: string; name: string; fromNiche: string; toNiche: string; description?: string; tag?: string }): Template {
  const newTpl: Template = {
    id: template.id,
    name: template.name,
    niche: template.toNiche,
    usedCount: 1,
    rating: 4.9,
    tag: template.tag || 'Custom Template',
    isMostUsed: false,
    emoji: getNicheEmoji(template.toNiche),
    description: template.description || `High-converting modern website template for ${template.toNiche}.`,
  };

  const current = getLocalTemplates();
  const exists = current.findIndex((t) => t.id === newTpl.id || t.name.toLowerCase() === newTpl.name.toLowerCase());
  const updated = exists >= 0 ? current.map((t, idx) => (idx === exists ? newTpl : t)) : [newTpl, ...current];

  localStorage.setItem(STORAGE_TEMPLATES, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent('lunao:templates-sync', { detail: updated }));

  if (template.toNiche && template.toNiche !== 'All' && template.toNiche !== 'General') {
    createAndSyncNiche(template.toNiche);
  }

  return newTpl;
}

// React hook for synchronized niches across any component
export function useSyncNiches(): [NicheItem[], (name: string, emoji?: string, color?: string) => Promise<NicheItem>, () => void] {
  const [niches, setNiches] = useState<NicheItem[]>(() => getLocalNiches());

  useEffect(() => {
    // Initial fetch from backend
    fetchNichesFromBackend().then(setNiches);

    const handleSync = (e: Event) => {
      const custom = e as CustomEvent<NicheItem[]>;
      if (Array.isArray(custom.detail)) {
        setNiches(custom.detail);
      } else {
        setNiches(getLocalNiches());
      }
    };

    window.addEventListener('lunao:niches-sync', handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('lunao:niches-sync', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const addNiche = useCallback(async (name: string, emoji?: string, color?: string) => {
    const item = await createAndSyncNiche(name, emoji, color);
    return item;
  }, []);

  const reload = useCallback(() => {
    fetchNichesFromBackend().then(setNiches);
  }, []);

  return [niches, addNiche, reload];
}

// React hook for synchronized templates across any component
export function useSyncTemplates(): [Template[], (t: { id: string; name: string; niche: string }) => Template, () => void] {
  const [templates, setTemplates] = useState<Template[]>(() => getLocalTemplates());

  useEffect(() => {
    fetchTemplatesFromBackend().then(setTemplates);

    const handleSync = (e: Event) => {
      const custom = e as CustomEvent<Template[]>;
      if (Array.isArray(custom.detail)) {
        setTemplates(custom.detail);
      } else {
        setTemplates(getLocalTemplates());
      }
    };

    window.addEventListener('lunao:templates-sync', handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('lunao:templates-sync', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const addTemplate = useCallback((t: { id: string; name: string; niche: string }) => {
    return addAndSyncTemplate(t);
  }, []);

  const reload = useCallback(() => {
    fetchTemplatesFromBackend().then(setTemplates);
  }, []);

  return [templates, addTemplate, reload];
}
