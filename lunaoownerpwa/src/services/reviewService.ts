import { Review } from '../types';
import { tenantDataService } from './tenantDataService';

export const reviewService = {
  setTenantId(_tenantId: string) {
    /* tenant context now derived from auth session */
  },

  async getReviews(businessId?: string): Promise<Review[]> {
    return tenantDataService.getReviews(businessId || '');
  },

  async respondToReview(reviewId: string, response: string, businessId?: string): Promise<Review> {
    await tenantDataService.respondToReview(businessId || '', reviewId, response);
    const all = await tenantDataService.getReviews(businessId || '');
    return (
      all.find((r) => r.id === reviewId) || ({ id: reviewId, response } as Review)
    );
  },
};
