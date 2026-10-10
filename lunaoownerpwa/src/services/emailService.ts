import { EmailTemplate, EmailActivityRecord } from '../types';
import { tenantDataService } from './tenantDataService';

export const emailService = {
  setTenantId(_tenantId: string) {
    /* tenant context now derived from auth session */
  },

  async getEmailTemplates(businessId?: string): Promise<EmailTemplate[]> {
    return tenantDataService.getEmailTemplates(businessId || '');
  },

  async createEmailTemplate(
    templateData: Omit<EmailTemplate, 'id'>,
    businessId?: string,
  ): Promise<EmailTemplate> {
    return tenantDataService.createEmailTemplate(businessId || '', templateData);
  },

  async updateEmailTemplate(
    templateId: string,
    updates: Partial<Omit<EmailTemplate, 'id'>>,
    businessId?: string,
  ): Promise<EmailTemplate> {
    await tenantDataService.updateEmailTemplate(businessId || '', templateId, updates);
    const list = await tenantDataService.getEmailTemplates(businessId || '');
    return list.find((t) => t.id === templateId) || ({} as EmailTemplate);
  },

  async deleteEmailTemplate(templateId: string, businessId?: string): Promise<boolean> {
    await tenantDataService.deleteEmailTemplate(businessId || '', templateId);
    return true;
  },

  async getEmailActivity(businessId?: string): Promise<EmailActivityRecord[]> {
    return tenantDataService.getEmailActivity(businessId || '');
  },

  async sendEmail(
    params: {
      recipientName?: string;
      recipientNames?: string[];
      recipientEmail?: string;
      recipientEmails?: string[];
      subject: string;
      body: string;
      templateName?: string;
    },
    businessId?: string,
  ): Promise<{ success: boolean; deliveredCount: number }> {
    // Accept both single-recipient and bulk-recipient call shapes so legacy
    // call sites using recipientNames[] keep working while the API only
    // handles one row at a time.
    const names = params.recipientNames || (params.recipientName ? [params.recipientName] : []);
    const emails = params.recipientEmails || (params.recipientEmail ? [params.recipientEmail] : []);
    let sent = 0;
    for (let i = 0; i < emails.length; i++) {
      await tenantDataService.sendEmail(businessId || '', {
        recipientName: names[i] || '',
        recipientEmail: emails[i],
        subject: params.subject,
        bodyPreview: params.body,
        templateName: params.templateName || '',
      });
      sent += 1;
    }
    return { success: true, deliveredCount: sent };
  },

  resetState(): void {
    /* no-op */
  },
};
