import { Conversation } from '../types';
import { tenantDataService } from './tenantDataService';

export const chatService = {
  setTenantId(_tenantId: string) {
    /* tenant context now derived from auth session */
  },

  async getConversations(businessId?: string): Promise<Conversation[]> {
    return tenantDataService.getConversations(businessId || '');
  },

  async getConversationById(id: string, businessId?: string): Promise<Conversation | null> {
    const full = await tenantDataService.getConversationMessages(businessId || '', id);
    if (full) return full;
    const list = await tenantDataService.getConversations(businessId || '');
    return list.find((c) => c.id === id) || null;
  },

  resetState(): void {
    /* no-op */
  },
};
