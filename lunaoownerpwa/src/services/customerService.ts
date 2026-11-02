import { Customer } from '../types';
import { tenantDataService } from './tenantDataService';

export const customerService = {
  setTenantId(_tenantId: string) {
    /* tenant context now derived from auth session */
  },

  async getCustomers(businessId?: string): Promise<Customer[]> {
    return tenantDataService.getCustomers(businessId || '');
  },

  async getCustomersWithEmail(businessId?: string): Promise<Customer[]> {
    const list = await tenantDataService.getCustomers(businessId || '');
    return list.filter((c) => !!c.email);
  },

  async getCustomerById(id: string, businessId?: string): Promise<Customer | null> {
    const list = await tenantDataService.getCustomers(businessId || '');
    return list.find((c) => c.id === id) || null;
  },

  async createCustomer(
    data: { name: string; phone?: string; email?: string | null; notes?: string | null },
    businessId?: string,
  ): Promise<Customer> {
    return tenantDataService.createCustomer(businessId || '', data);
  },

  async updateCustomerNotes(id: string, notes: string, businessId?: string): Promise<Customer> {
    await tenantDataService.updateCustomerNotes(businessId || '', id, notes);
    const refreshed = await tenantDataService.getCustomers(businessId || '');
    return refreshed.find((c) => c.id === id) || ({} as Customer);
  },

  resetState(): void {
    /* no-op */
  },
};
