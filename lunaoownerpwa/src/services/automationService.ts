import { Automation, TenantBusiness } from '../types';
import { emailService } from './emailService';
import { customerService } from './customerService';
import { tenantDataService } from './tenantDataService';

export const automationService = {
  setTenantId(_tenantId: string) {
    /* tenant context now derived from auth session */
  },

  async getAutomations(businessId?: string): Promise<Automation[]> {
    return tenantDataService.getAutomations(businessId || '');
  },

  async toggleAutomation(id: string, enabled: boolean, businessId?: string): Promise<Automation> {
    const all = await tenantDataService.getAutomations(businessId || '');
    const target = all.find((a) => a.id === String(id));
    if (!target) throw new Error('Automation not found');
    await tenantDataService.updateAutomation(businessId || '', Number(id), { enabled });
    return { ...target, enabled };
  },

  async updateTiming(
    id: string,
    timing: { value: number; unit: 'minutes' | 'hours' | 'days' },
    businessId?: string,
  ): Promise<Automation> {
    const all = await tenantDataService.getAutomations(businessId || '');
    const target = all.find((a) => a.id === String(id));
    await tenantDataService.updateAutomation(businessId || '', Number(id), { timing });
    return target ? { ...target, timing } : ({} as Automation);
  },

  async updateEmailTemplate(
    id: string,
    data: { emailSubject: string; emailBody: string },
    businessId?: string,
  ): Promise<Automation> {
    const all = await tenantDataService.getAutomations(businessId || '');
    const target = all.find((a) => a.id === String(id));
    await tenantDataService.updateAutomation(businessId || '', Number(id), data);
    return target
      ? { ...target, emailSubject: data.emailSubject, emailBody: data.emailBody }
      : ({} as Automation);
  },

  async triggerReactivationNow(
    business: TenantBusiness,
    thresholdDays?: number,
  ): Promise<{ sentCount: number; recipients: string[] }> {
    const customers = await customerService.getCustomersWithEmail(business.id);
    const daysThreshold = thresholdDays || 30;

    const eligible = customers.filter((c) => {
      if (!c.email) return false;
      if (!c.lastBookingDate) return true;
      const last = new Date(c.lastBookingDate).getTime();
      if (Number.isNaN(last)) return true;
      const now = Date.now();
      const diffDays = (now - last) / (1000 * 60 * 60 * 24);
      return diffDays >= daysThreshold || c.bookingCount > 0;
    });

    const targetList = eligible.length > 0 ? eligible : customers.slice(0, 3);
    const recipientEmails = targetList.map((c) => c.email as string);
    const recipientNames = targetList.map((c) => c.name);

    const automations = await tenantDataService.getAutomations(business.id);
    const auto = automations.find((a) => a.templateId === 'customer_reactivation');

    const subject = auto?.emailSubject
      ? auto.emailSubject.replace(/\{\{business_name\}\}/g, business.name)
      : `Special Re-booking Invitation from ${business.name}`;

    const body = auto?.emailBody
      ? auto.emailBody
          .replace(/\{\{business_name\}\}/g, business.name)
          .replace(/\{\{phone\}\}/g, business.phone)
          .replace(/\{\{website_url\}\}/g, business.websiteUrl)
      : `We would love to welcome you back to ${business.name}! Visit ${business.websiteUrl} to schedule your next appointment.`;

    for (let i = 0; i < targetList.length; i++) {
      await emailService.sendEmail(
        {
          recipientName: recipientNames[i],
          recipientEmail: recipientEmails[i],
          subject,
          body,
          templateName: 'Customer Reactivation',
        },
        business.id,
      );
    }

    return {
      sentCount: recipientEmails.length,
      recipients: recipientNames,
    };
  },

  async testDispatchAutomation(
    id: string,
    business: TenantBusiness,
    testEmail: string,
  ): Promise<{ success: boolean; subject: string }> {
    const automations = await tenantDataService.getAutomations(business.id);
    const auto = automations.find((a) => a.id === id);
    if (!auto) throw new Error('Automation not found');

    const renderedSubject = auto.emailSubject
      .replace(/\{\{business_name\}\}/g, business.name)
      .replace(/\{\{service\}\}/g, 'Standard Service')
      .replace(/\{\{date\}\}/g, 'Sep 10, 2026')
      .replace(/\{\{time\}\}/g, '11:00 AM')
      .replace(/\{\{customer_name\}\}/g, 'Valued Client');

    const renderedBody = auto.emailBody
      .replace(/\{\{customer_name\}\}/g, 'Valued Client')
      .replace(/\{\{business_name\}\}/g, business.name)
      .replace(/\{\{service\}\}/g, 'Standard Service')
      .replace(/\{\{date\}\}/g, 'Sep 10, 2026')
      .replace(/\{\{time\}\}/g, '11:00 AM')
      .replace(/\{\{address\}\}/g, business.address)
      .replace(/\{\{phone\}\}/g, business.phone)
      .replace(/\{\{website_url\}\}/g, business.websiteUrl);

    await emailService.sendEmail(
      {
        recipientName: 'Test Recipient (Owner Preview)',
        recipientEmail: testEmail || business.email,
        subject: `[TEST] ${renderedSubject}`,
        body: renderedBody,
        templateName: `${auto.name} (Simulation)`,
      },
      business.id,
    );

    return {
      success: true,
      subject: renderedSubject,
    };
  },

  resetState(): void {
    /* no-op */
  },
};
