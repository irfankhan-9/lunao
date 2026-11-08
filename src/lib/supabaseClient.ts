// Client-side Supabase REST Bridge & Smoke Test SDK for Lunao
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://wqlbuadknltsjfzrltpe.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxbGJ1YWRrbmx0c2pmenJsdHBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMzE3ODksImV4cCI6MjEwNzcwNzc4OX0.et1OsefPRtiP3OTodktsfhf3Bxbaq6_zY7XdMUZ53Bw';

// Fast resilient fetch wrapper to prevent 20s network hangs when Supabase project is degraded
const fastFetch: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);

  const initSignal = init?.signal;
  if (initSignal) {
    initSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return fetch(input, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timer))
    .catch((err) => {
      // Silently convert network/CORS timeouts to standard response error rather than unhandled rejection
      if (err.name === 'AbortError' || err.message?.includes('Failed to fetch')) {
        return new Response(JSON.stringify({ error: 'Supabase network timeout' }), {
          status: 504,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw err;
    });
};

export const supabaseClient: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
  global: {
    fetch: fastFetch,
  },
});

export interface SupabaseQueryResult<T = any> {
  ok: boolean;
  data?: T[];
  count?: number | null;
  error?: string;
}

/**
 * Fetch rows from a Supabase table via server API route or SDK
 */
export async function fetchSupabaseRows<T = any>(
  tableName: string = 'lunao_smoke_tests',
  limit: number = 50
): Promise<SupabaseQueryResult<T>> {
  try {
    const res = await fetch(`/api/supabase/rows?table=${encodeURIComponent(tableName)}&limit=${limit}`);
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { ok: false, error: err.message || 'Failed to fetch Supabase rows' };
  }
}

/**
 * Fetch distinct count or stats from a Supabase table
 */
export async function fetchSupabaseStats(
  tableName: string = 'lunao_smoke_tests'
): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    const res = await fetch(`/api/supabase/stats?table=${encodeURIComponent(tableName)}`);
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { ok: false, count: 0, error: err.message || 'Failed to fetch stats' };
  }
}
