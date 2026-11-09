import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabaseClient } from '../lib/supabaseClient';
import { setVibeCreditBalance } from '../lib/vibeCredits';

export interface AuthUser {
  id: string;
  ownerKey: string;
  email: string;
  name: string;
  picture?: string;
  plan?: string;
  credits?: number;
  vibeCredits?: number;
}

interface GateContextValue {
  unlocked: boolean;
  loading: boolean;
  user: AuthUser | null;
  signInWithGoogle: () => Promise<AuthUser>;
  signInWithSupabaseGoogle: () => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const GateContext = createContext<GateContextValue | null>(null);

function readStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('lunao_auth_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.ownerKey && (parsed.email || parsed.id)) {
      return parsed as AuthUser;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function GateProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());
  const [unlocked, setUnlocked] = useState<boolean>(() => Boolean(readStoredUser()));
  const [loading, setLoading] = useState<boolean>(() => !Boolean(readStoredUser()));

  const applyAuthenticatedSession = useCallback(
    (
      authUser: AuthUser,
      planInput?: string,
      userCreditsInput?: number,
      vibeCreditsInput?: number
    ) => {
      const ownerKey = authUser.ownerKey;
      try {
        const resolvedPlan =
          planInput ||
          localStorage.getItem(`lunao_u_${ownerKey}_plan`) ||
          'Free Plan';
        localStorage.setItem(`lunao_u_${ownerKey}_plan`, resolvedPlan);
        localStorage.setItem('lunao_user_plan', resolvedPlan);

        const resolvedCredits =
          typeof userCreditsInput === 'number'
            ? userCreditsInput
            : (() => {
                const cached =
                  localStorage.getItem(`lunao_u_${ownerKey}_credits`) ||
                  localStorage.getItem('lunao_user_credits');
                return cached !== null ? parseFloat(cached) : 0;
              })();
        localStorage.setItem(`lunao_u_${ownerKey}_credits`, String(resolvedCredits));
        localStorage.setItem('lunao_user_credits', String(resolvedCredits));

        const isFree = resolvedPlan.toLowerCase().includes('free');
        const resolvedVibe = isFree
          ? 0
          : typeof vibeCreditsInput === 'number'
            ? vibeCreditsInput
            : parseFloat(localStorage.getItem(`lunao_u_${ownerKey}_vibe_credits`) || '0');
        setVibeCreditBalance(resolvedVibe);

        const updatedAuthUser: AuthUser = {
          ...authUser,
          plan: resolvedPlan,
          credits: resolvedCredits,
          vibeCredits: resolvedVibe,
        };
        localStorage.setItem('lunao_auth_user', JSON.stringify(updatedAuthUser));
        localStorage.setItem('lunao_owner_key', ownerKey);
        localStorage.setItem('lunao_auth_token', ownerKey);
        localStorage.setItem('lunao_unlocked', 'true');

        window.dispatchEvent(
          new CustomEvent('lunao_auth_changed', {
            detail: {
              user: updatedAuthUser,
              plan: resolvedPlan,
              userCredits: resolvedCredits,
              vibeCredits: resolvedVibe,
            },
          })
        );
        setUser(updatedAuthUser);
      } catch {
        setUser(authUser);
      }
      setUnlocked(true);
      setLoading(false);
    },
    []
  );

  const refresh = useCallback(async () => {
    const stored = readStoredUser();
    if (!stored) {
      setUser(null);
      setUnlocked(false);
      return;
    }

    try {
      localStorage.setItem('lunao_owner_key', stored.ownerKey);
      localStorage.setItem('lunao_auth_token', stored.ownerKey);
    } catch {}

    setUser(stored);
    setUnlocked(true);

    try {
      const res = await fetch('/api/auth/me', {
        headers: {
          'x-owner-key': stored.ownerKey,
          Authorization: `Bearer ${stored.ownerKey}`,
        },
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && data.user) {
          const mergedUser: AuthUser = {
            id: data.user.id || stored.id,
            ownerKey: data.user.ownerKey || stored.ownerKey,
            email: data.user.email || stored.email,
            name: data.user.name || stored.name,
            picture: data.user.picture || stored.picture,
            credits: typeof data.userCredits === 'number' ? data.userCredits : undefined,
          };
          applyAuthenticatedSession(
            mergedUser,
            data.plan,
            data.userCredits,
            data.vibeCredits
          );
        }
      }
    } catch {
      // Keep local stored session when offline
    }
  }, [applyAuthenticatedSession]);

  // Listen to Supabase Auth state changes
  useEffect(() => {
    const hydrateAndApplySession = async (authUser: AuthUser) => {
      let serverCredits: number | undefined = undefined;
      let serverPlan: string | undefined = undefined;
      let serverVibe: number | undefined = undefined;

      try {
        const res = await fetch('/api/auth/me', {
          headers: {
            'x-owner-key': authUser.ownerKey,
            Authorization: `Bearer ${authUser.ownerKey}`,
          },
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.ok) {
            if (typeof data.userCredits === 'number') serverCredits = data.userCredits;
            if (data.plan) serverPlan = data.plan;
            if (typeof data.vibeCredits === 'number') serverVibe = data.vibeCredits;
          }
        }
      } catch {}

      const mergedUser: AuthUser = {
        ...authUser,
        credits: typeof serverCredits === 'number' ? serverCredits : authUser.credits,
      };
      applyAuthenticatedSession(mergedUser, serverPlan, serverCredits, serverVibe);
    };

    (async () => {
      try {
        const sessionPromise = supabaseClient.auth.getSession();
        const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 1200)
        );
        const { data } = await Promise.race([sessionPromise, timeoutPromise]).catch(() => ({ data: { session: null } }));

        if (data?.session?.user) {
          const sbUser = data.session.user;
          const email = sbUser.email || 'user@lunao.app';
          const name = sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || email.split('@')[0];
          const picture = sbUser.user_metadata?.avatar_url || sbUser.user_metadata?.picture || '';
          const ownerKey = `user_${sbUser.id || email.replace(/[^a-zA-Z0-9]/g, '_')}`;

          const authUser: AuthUser = {
            id: sbUser.id,
            ownerKey,
            email,
            name,
            picture,
          };
          await hydrateAndApplySession(authUser);
        } else {
          await refresh();
        }
      } catch {
        await refresh();
      } finally {
        setLoading(false);
      }
    })();

    const { data: authListener } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) {
        const sbUser = session.user;
        const email = sbUser.email || 'user@lunao.app';
        const name = sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || email.split('@')[0];
        const picture = sbUser.user_metadata?.avatar_url || sbUser.user_metadata?.picture || '';
        const ownerKey = `user_${sbUser.id || email.replace(/[^a-zA-Z0-9]/g, '_')}`;

        const authUser: AuthUser = {
          id: sbUser.id,
          ownerKey,
          email,
          name,
          picture,
        };
        await hydrateAndApplySession(authUser);

        if (typeof window !== 'undefined' && window.location.hash.includes('access_token=')) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [applyAuthenticatedSession, refresh]);

  // Trigger Supabase Google OAuth Flow
  const signInWithSupabaseGoogle = useCallback(async (): Promise<void> => {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      throw error;
    }
  }, []);

  // Standard 1-tap Google User sign-in (Official GIS popup + server session minting)
  const signInWithGoogle = useCallback(async (): Promise<AuthUser> => {
    let googleUser: { uid: string; email: string; name: string; picture: string } | null = null;

    // 1. Primary: Google Identity Services (GIS)
    try {
      const { signInWithGoogleGIS } = await import('../lib/gisAuth');
      googleUser = await signInWithGoogleGIS();
    } catch (gisErr: any) {
      const msg = String(gisErr?.message || '');
      if (msg.includes('popup-closed-by-user') || msg.includes('access_denied')) {
        throw gisErr;
      }
      console.warn('[auth] GIS sign-in notice, attempting Firebase Auth fallback:', msg);
      // 2. Secondary fallback: Firebase Auth
      try {
        const { signInWithGooglePopup } = await import('../lib/firebaseAuth');
        googleUser = await signInWithGooglePopup();
      } catch (fbErr: any) {
        if (String(fbErr?.message || '').includes('popup-closed-by-user')) {
          throw fbErr;
        }
        throw new Error('Google sign-in could not be completed. Please allow popups and try again.');
      }
    }

    if (!googleUser || !googleUser.email) {
      throw new Error('Google sign-in was canceled.');
    }

    // Exchange Google credentials with backend session
    const res = await fetch('/api/auth/google-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: googleUser.uid,
        email: googleUser.email,
        name: googleUser.name,
        picture: googleUser.picture,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.user) {
      throw new Error(data.error || 'Failed to authenticate Google session on server.');
    }

    const authUser: AuthUser = {
      id: data.user.id || googleUser.uid,
      ownerKey: data.user.ownerKey,
      email: data.user.email || googleUser.email,
      name: data.user.name || googleUser.name,
      picture: data.user.picture || googleUser.picture,
      plan: data.plan || 'Free Plan',
      credits: data.userCredits,
      vibeCredits: data.vibeCredits,
    };

    applyAuthenticatedSession(
      authUser,
      data.plan || 'Free Plan',
      data.userCredits,
      data.vibeCredits
    );
    return authUser;
  }, [applyAuthenticatedSession]);

  const logout = useCallback(async () => {
    try {
      await supabaseClient.auth.signOut();
    } catch {}
    try {
      await fetch('/api/site-gate/logout', { method: 'POST', credentials: 'include' });
    } catch {}

    try {
      localStorage.removeItem('lunao_auth_user');
      localStorage.removeItem('lunao_unlocked');
      localStorage.removeItem('lunao_auth_token');
      localStorage.removeItem('lunao_owner_key');
      localStorage.removeItem('lunao_user_plan');
      localStorage.removeItem('lunao_user_credits');
      localStorage.removeItem('lunao_vibe_credits');
      localStorage.removeItem('lunao_custom_templates');
      localStorage.removeItem('lunao_campaigns');
      localStorage.removeItem('lunao_businesses');
      localStorage.removeItem('lunao_sms_logs');
      localStorage.removeItem('lunao_sd_results');
    } catch {}

    setUser(null);
    setUnlocked(false);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('lunao_auth_changed', { detail: { user: null } }));
    }
  }, []);

  return (
    <GateContext.Provider value={{ unlocked, loading, user, signInWithGoogle, signInWithSupabaseGoogle, refresh, logout }}>
      {children}
    </GateContext.Provider>
  );
}

export function useGate() {
  const ctx = useContext(GateContext);
  if (!ctx) throw new Error('useGate must be used inside <GateProvider>');
  return ctx;
}
