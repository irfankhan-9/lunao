import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { TenantBusiness, NavSection } from '../types';
import { tenantAuthService } from '../services/tenantAuthService';
import { tenantDataService } from '../services/tenantDataService';
import { bookingService } from '../services/bookingService';
import { customerService } from '../services/customerService';
import { chatService } from '../services/chatService';
import { automationService } from '../services/automationService';
import { emailService } from '../services/emailService';
import { emailAuthService } from '../services/emailAuthService';
import { reviewService } from '../services/reviewService';
import { soundEffects } from '../utils/soundEffects';

interface BusinessContextType {
  isAuthenticated: boolean;
  activeLunaoCode: string | null;
  business: TenantBusiness | null;
  activeSection: NavSection;
  toastMessage: string | null;
  isAuthenticating: boolean;
  authError: string | null;
  setAuthError: (err: string | null) => void;

  loginWithCode: (code: string) => Promise<boolean>;
  logout: () => void;
  setActiveSection: (section: NavSection) => void;
  updateBusiness: (updates: Partial<TenantBusiness>) => Promise<void>;
  updateBusinessDetails: (updates: Partial<TenantBusiness>) => Promise<void>;
  updateAISettings: (updates: Partial<TenantBusiness['aiSettings']>) => Promise<void>;
  updateWebsiteConfig: (updates: Partial<TenantBusiness['websiteConfig']>) => Promise<void>;
  showToast: (message: string) => void;
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

// Graceful initial state for pre-auth render — avoids crashing before auth.
const NULL_BUSINESS: TenantBusiness = {
  id: '',
  lunaoCode: '',
  slug: '',
  name: 'Lunao Owner',
  niche: '',
  tagline: '',
  logoUrl: null,
  phone: '',
  email: '',
  address: '',
  city: '',
  timezone: '',
  websiteUrl: '',
  socialLinks: {},
  theme: {
    accent: '#059669',
    accentDark: '#047857',
    accentSoft: '#ecfdf5',
    accentBorder: '#a7f3d0',
    surface: '#ffffff',
    radius: 'lg',
  },
  features: { booking: true, chatbot: true, email: true, automations: true },
  aiSettings: {
    enabled: true,
    greeting: '',
    tone: 'friendly',
    businessDescription: '',
    businessHours: '',
    locationDetails: '',
    faqs: [],
    policies: '',
    bookingEnabled: true,
    bookingInstructions: '',
    infoToCollect: [],
    confirmationBehavior: '',
    doNotClaim: '',
    escalationGuidance: '',
  },
  websiteConfig: {
    url: '',
    status: 'draft',
    lastUpdated: null,
    lastDeployed: null,
    headline: '',
    subheadline: '',
    heroImage: '',
    ctaText: '',
    announcement: '',
  },
};

export const BusinessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeLunaoCode, setActiveLunaoCode] = useState<string | null>(null);
  const [business, setBusiness] = useState<TenantBusiness | null>(null);
  const [activeSection, setActiveSectionState] = useState<NavSection>('dashboard');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Try to restore a persisted session on mount.
  useEffect(() => {
    (async () => {
      const session = await tenantAuthService.getStoredSession();
      if (session?.business && session?.token) {
        setBusiness(session.business);
        setActiveLunaoCode(session.code);
        setIsAuthenticated(true);
      }
    })();
  }, []);

  // Apply CSS theme tokens whenever business theme changes.
  useEffect(() => {
    const root = document.documentElement;
    if (business?.theme) {
      root.style.setProperty('--business-accent', business.theme.accent);
      root.style.setProperty('--business-accent-dark', business.theme.accentDark);
      root.style.setProperty('--business-accent-soft', business.theme.accentSoft);
      root.style.setProperty('--business-accent-border', business.theme.accentBorder);
    }
  }, [business?.theme]);

  // Update document title when authenticated.
  useEffect(() => {
    if (isAuthenticated && business?.name) {
      document.title = `${business.name} | Owner Portal`;
    } else {
      document.title = 'Lunao Owner Portal';
    }
  }, [isAuthenticated, business?.name]);

  const doScrollTop = useCallback(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const main = document.querySelector('main');
    if (main) main.scrollTop = 0;
  }, []);

  const setActiveSection = useCallback((section: NavSection) => {
    setActiveSectionState((prev) => {
      if (prev !== section) soundEffects.playSectionSwitch();
      return section;
    });
    doScrollTop();
  }, [doScrollTop]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    const t = setTimeout(() => setToastMessage(null), 3200);
    return () => clearTimeout(t);
  }, []);

  const loginWithCode = useCallback(
    async (code: string): Promise<boolean> => {
      setIsAuthenticating(true);
      setAuthError(null);
      try {
        const result = await tenantAuthService.authenticateCode(code);
        if (result.success && result.business) {
          setActiveLunaoCode(code.trim().toUpperCase());
          setBusiness({ ...result.business });
          setIsAuthenticated(true);
          setActiveSectionState('dashboard');
          doScrollTop();
          showToast(`Welcome, Owner of ${result.business.name}!`);
          return true;
        } else {
          setAuthError(result.errorMessage || 'Invalid Lunao code');
          return false;
        }
      } finally {
        setIsAuthenticating(false);
      }
    },
    [showToast, doScrollTop],
  );

  const logout = useCallback(() => {
    tenantAuthService.logout();
    setIsAuthenticated(false);
    setActiveLunaoCode(null);
    setBusiness(null);
    setAuthError(null);
    doScrollTop();
    showToast('Signed out of owner portal');
  }, [showToast, doScrollTop]);

  const updateBusiness = useCallback(
    async (updates: Partial<TenantBusiness>) => {
      if (!business?.id) return;
      const updated = await tenantDataService.updateBusiness(business.id, updates);
      setBusiness(updated);
      showToast('Business profile updated');
    },
    [business?.id, showToast],
  );

  const updateAISettings = useCallback(
    async (updates: Partial<TenantBusiness['aiSettings']>) => {
      if (!business?.id) return;
      const existing = await tenantDataService.getAISettings(business.id);
      const merged = { ...existing, ...updates };
      const updated = await tenantDataService.updateAISettings(business.id, merged);
      setBusiness((prev) => (prev ? { ...prev, aiSettings: updated } : prev));
      showToast('AI Receptionist settings saved');
    },
    [business?.id, showToast],
  );

  const updateWebsiteConfig = useCallback(
    async (updates: Partial<TenantBusiness['websiteConfig']>) => {
      if (!business?.id) return;
      const existing = await tenantDataService.getWebsiteConfig(business.id);
      const merged = { ...existing, ...updates };
      const updated = await tenantDataService.updateWebsiteConfig(business.id, merged);
      setBusiness((prev) => (prev ? { ...prev, websiteConfig: updated } : prev));
      showToast('Website content updated');
    },
    [business?.id, showToast],
  );

  return (
    <BusinessContext.Provider
      value={{
        isAuthenticated,
        activeLunaoCode,
        business,
        activeSection,
        toastMessage,
        isAuthenticating,
        authError,
        setAuthError,
        loginWithCode,
        logout,
        setActiveSection,
        updateBusiness,
        updateBusinessDetails: updateBusiness,
        updateAISettings,
        updateWebsiteConfig,
        showToast,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
};

export function useBusiness(): BusinessContextType {
  const context = useContext(BusinessContext);
  if (!context) {
    throw new Error('useBusiness must be used within a BusinessProvider');
  }
  return context;
}
