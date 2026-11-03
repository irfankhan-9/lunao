import { WebsiteConfig } from '../types';
import { tenantDataService } from './tenantDataService';

export const websiteService = {
  async getWebsite(businessId: string): Promise<WebsiteConfig> {
    return tenantDataService.getWebsiteConfig(businessId);
  },

  async getWebsiteHtml(businessId: string): Promise<{ ok: boolean; html: string; slug: string; url: string }> {
    return tenantDataService.getWebsiteHtml(businessId);
  },

  async saveWebsiteHtml(businessId: string, html: string): Promise<{ ok: boolean; slug: string; url: string; message: string }> {
    return tenantDataService.saveWebsiteHtml(businessId, html);
  },

  async deployWebsiteHtml(businessId: string, html?: string): Promise<{ ok: boolean; slug: string; url: string; lastDeployed: string }> {
    return tenantDataService.deployWebsiteHtml(businessId, html);
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
