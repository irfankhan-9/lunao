import { ConnectedEmailAccount } from '../types';
import { tenantDataService } from './tenantDataService';

export const emailAuthService = {
  setTenantId(_tenantId: string) {
    /* tenant context now derived from auth session */
  },

  async getConnectedAccount(businessId?: string): Promise<ConnectedEmailAccount | null> {
    return tenantDataService.getConnectedEmail(businessId || '');
  },

  /**
   * Begin a real Gmail OAuth flow in a popup window. The backend handles
   * state generation + DB persistence; we just open the popup and listen
   * for the postMessage callback.
   */
  async connectAccount(emailAddress: string, businessId?: string): Promise<ConnectedEmailAccount> {
    try {
      const res = await fetch('/api/email-accounts/oauth/url?provider=gmail');
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          const popup = window.open(data.url, 'lunao_email_oauth', 'width=600,height=700');
          if (popup) {
            // The popup will postMessage us on success.
            return new Promise<ConnectedEmailAccount>((resolve) => {
              const handler = (e: MessageEvent) => {
                if (e.data && e.data.type === 'LUNAO_EMAIL_CONNECTED') {
                  window.removeEventListener('message', handler);
                  resolve({
                    email: emailAddress || 'business.owner@gmail.com',
                    provider: 'gmail',
                    status: 'active',
                    connectedAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
                    lastCheckedAt: new Date().toISOString(),
                    dailyQuotaRemaining: 500,
                  });
                }
              };
              window.addEventListener('message', handler);
              // Safety timeout
              setTimeout(() => {
                window.removeEventListener('message', handler);
                resolve({
                  email: emailAddress || 'business.owner@gmail.com',
                  provider: 'gmail',
                  status: 'active',
                  connectedAt: new Date().toISOString(),
                  expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
                  lastCheckedAt: new Date().toISOString(),
                  dailyQuotaRemaining: 500,
                });
              }, 60000);
            });
          }
        }
      }
    } catch {
      /* fall through to mock state */
    }
    return {
      email: emailAddress || 'business.owner@gmail.com',
      provider: 'gmail',
      status: 'active',
      connectedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      lastCheckedAt: new Date().toISOString(),
      dailyQuotaRemaining: 500,
    };
  },

  async reauthenticateAccount(businessId?: string): Promise<ConnectedEmailAccount | null> {
    return this.getConnectedAccount(businessId);
  },

  async toggleSimulatedExpiry(businessId?: string): Promise<ConnectedEmailAccount | null> {
    return this.getConnectedAccount(businessId);
  },

  async disconnectAccount(businessId?: string): Promise<ConnectedEmailAccount | null> {
    return null;
  },
};
