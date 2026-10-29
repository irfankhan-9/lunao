import { TenantBusiness } from '../types';
import { tenantDataService } from './tenantDataService';

export const businessService = {
  async getBusiness(businessId?: string): Promise<TenantBusiness> {
    return tenantDataService.getBusiness(businessId || '');
  },

  async updateBusinessSettings(
    businessId: string,
    updates: Partial<TenantBusiness>,
  ): Promise<TenantBusiness> {
    return tenantDataService.updateBusiness(businessId, updates);
  },

  async updateAISettings(
    businessId: string,
    aiUpdates: Partial<TenantBusiness['aiSettings']>,
  ): Promise<TenantBusiness['aiSettings']> {
    return tenantDataService.updateAISettings(businessId, aiUpdates);
  },
};
