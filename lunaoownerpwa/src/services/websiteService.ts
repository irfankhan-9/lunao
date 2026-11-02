import { WebsiteConfig } from '../types';
import { tenantDataService } from './tenantDataService';

export const websiteService = {
  async getWebsite(businessId: string): Promise<WebsiteConfig> {
    return tenantDataService.getWebsiteConfig(businessId);
  },

  async updateWebsite(
    businessId: string,
    updates: Partial<WebsiteConfig>,
  ): Promise<WebsiteConfig> {
    return tenantDataService.updateWebsiteConfig(businessId, updates);
  },

  async deployWebsite(businessId: string): Promise<WebsiteConfig> {
    return tenantDataService.deployWebsite(businessId);
  },
};
