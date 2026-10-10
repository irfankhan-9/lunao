import { Integration } from '../types';
import { tenantDataService } from './tenantDataService';

export const integrationService = {
  async getIntegrations(businessId?: string): Promise<Integration[]> {
    return tenantDataService.getIntegrations(businessId || '');
  },

  async toggleIntegrationStatus(
    id: string,
    targetStatus: 'connected' | 'not_connected',
  ): Promise<Integration> {
    // Integration toggling lives on the agency side; for the PWA we only
    // surface the connected/disconnected state. The endpoint just acks.
    const list = await tenantDataService.getIntegrations('');
    const found = list.find((i) => i.id === id);
    return (
      found || {
        id,
        provider: 'calendar_sync',
        name: '',
        description: '',
        status: targetStatus,
      }
    );
  },

  async toggleIntegration(
    id: string,
    targetConnected: boolean,
  ): Promise<Integration> {
    return this.toggleIntegrationStatus(id, targetConnected ? 'connected' : 'not_connected');
  },

  resetState(): void {
    /* no-op */
  },
};
