import { Booking, BookingStatus } from '../types';
import { tenantDataService } from './tenantDataService';

export const bookingService = {
  setTenantId(_tenantId: string) {
    // Tenant context is now derived from the auth session (bearer token +
    // slug). Kept for API compatibility with existing call sites.
  },

  async getBookings(businessId?: string): Promise<Booking[]> {
    return tenantDataService.getBookings(businessId || '');
  },

  async getBookingById(id: string, businessId?: string): Promise<Booking | null> {
    const list = await tenantDataService.getBookings(businessId || '');
    return list.find((b) => b.id === id) || null;
  },

  async updateBookingStatus(id: string, status: BookingStatus, businessId?: string): Promise<Booking> {
    return tenantDataService.updateBookingStatus(businessId || '', id, status);
  },

  async createBooking(data: Omit<Booking, 'id' | 'createdAt'>, businessId?: string): Promise<Booking> {
    return tenantDataService.createBooking(businessId || '', data);
  },

  resetState(): void {
    /* no-op — server is the source of truth */
  },
};
