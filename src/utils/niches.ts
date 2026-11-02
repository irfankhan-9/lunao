import { useState, useEffect } from 'react';
import { nicheList as defaultNicheList } from '../data';

export interface NicheItem {
  id: string;
  label: string;
  emoji: string;
  color?: string;
}

// In-memory synced list, starting with the website's master niches
let currentNiches: NicheItem[] = [...defaultNicheList];

// Subscribers for cross-component reactive updates
const listeners = new Set<(niches: NicheItem[]) => void>();

function notify() {
  const copy = [...currentNiches];
  listeners.forEach((listener) => listener(copy));
}

// Map common niches to characteristic emoji
export function getEmojiForNicheName(name: string): string {
  const n = String(name || '').toLowerCase();
  if (n.includes('barber')) return '💈';
  if (n.includes('salon') || n.includes('hair') || n.includes('spa') || n.includes('beauty')) return '💅';
  if (n.includes('dent')) return '🦷';
  if (n.includes('hvac') || n.includes('cool') || n.includes('heat') || n.includes('air')) return '❄️';
  if (n.includes('roof')) return '🏠';
  if (n.includes('gym') || n.includes('fit') || n.includes('train')) return '💪';
  if (n.includes('real') || n.includes('estate') || n.includes('realt') || n.includes('prop')) return '🏡';
  if (n.includes('plumb')) return '🔧';
  if (n.includes('electric')) return '⚡';
  if (n.includes('clean')) return '✨';
  if (n.includes('auto') || n.includes('car')) return '🚗';
  if (n.includes('pet') || n.includes('dog') || n.includes('cat') || n.includes('groom')) return '🐾';
  if (n.includes('food') || n.includes('rest') || n.includes('cafe')) return '🍽️';
  if (n.includes('law') || n.includes('legal')) return '⚖️';
  if (n.includes('acc') || n.includes('tax') || n.includes('book')) return '📊';
  if (n.includes('solar')) return '☀️';
  if (n.includes('paint')) return '🎨';
  if (n.includes('landscap') || n.includes('lawn') || n.includes('garden')) return '🌿';
  return '✨';
}

// Fetch all niches from backend /api/niches and merge into state
export async function refreshNiches(): Promise<NicheItem[]> {
  try {
    const res = await fetch('/api/niches');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.niches) && data.niches.length > 0) {
        const map = new Map<string, NicheItem>();
        // First add defaults
        defaultNicheList.forEach((item) => {
          map.set(item.id.toLowerCase(), { ...item });
        });
        // Merge server response
        data.niches.forEach((item: any) => {
          const id = item.id || item.name || item.label;
          const label = item.label || item.name || id;
          const emoji = item.emoji || item.icon || getEmojiForNicheName(label);
          if (id && label) {
            map.set(id.toLowerCase(), {
              id: label,
              label,
              emoji: emoji && emoji !== 'layout' ? emoji : getEmojiForNicheName(label),
              color: item.color || '#2563EB',
            });
          }
        });
        currentNiches = Array.from(map.values());
        notify();
        return currentNiches;
      }
    }
  } catch (err) {
    console.warn('[niches] Failed to refresh niches from server:', err);
  }
  return currentNiches;
}

// Initial fetch on module load in browser
if (typeof window !== 'undefined') {
  refreshNiches();
}

/**
 * Persist and register a new niche both in local state and to the backend DB.
 * Immediately notifies all site components (Templates, Campaigns, AI Web Studio).
 */
export async function registerNewNiche(name: string, emoji?: string): Promise<NicheItem> {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('Niche name cannot be empty');

  const resolvedEmoji = emoji || getEmojiForNicheName(clean);
  const newItem: NicheItem = {
    id: clean,
    label: clean,
    emoji: resolvedEmoji,
    color: '#2563EB',
  };

  // Optimistic update
  const existingIdx = currentNiches.findIndex((n) => n.id.toLowerCase() === clean.toLowerCase());
  if (existingIdx === -1) {
    currentNiches = [...currentNiches, newItem];
    notify();
  }

  // Persist to backend DB
  try {
    const res = await fetch('/api/niches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: clean, emoji: resolvedEmoji }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.niche) {
        newItem.id = data.niche.label || clean;
        newItem.label = data.niche.label || clean;
        newItem.emoji = data.niche.emoji || resolvedEmoji;
      }
    }
  } catch (err) {
    console.warn('[niches] Backend save failed, kept in local state:', err);
  }

  return newItem;
}

/**
 * React hook to access and subscribe to the live, synchronized niche list.
 */
export function useNiches(): {
  niches: NicheItem[];
  addNiche: (name: string, emoji?: string) => Promise<NicheItem>;
  refresh: () => Promise<NicheItem[]>;
} {
  const [niches, setNiches] = useState<NicheItem[]>(currentNiches);

  useEffect(() => {
    setNiches(currentNiches);
    const handler = (updated: NicheItem[]) => setNiches(updated);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  return {
    niches,
    addNiche: registerNewNiche,
    refresh: refreshNiches,
  };
}

export function getNiches(): NicheItem[] {
  return [...currentNiches];
}

export default useNiches;
