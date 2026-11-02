// Resend Email Delivery Service for Lunao
// Official SDK integration with safe startup diagnostics, sandbox auto-routing,
// and transactional email formatting.

import { Resend } from 'resend';
import { resend as resendCfg } from './config.js';

let resendClient = null;

export function getResendClient() {
  if (!resendCfg.live) return null;
  if (!resendClient) {
    try {
      resendClient = new Resend(resendCfg.apiKey);
    } catch (err) {
      console.warn('[Resend] Failed to initialize client:', err.message);
      return null;
    }
  }
  return resendClient;
}

export function checkResendConfig() {
  const hasKey = Boolean(resendCfg.apiKey && resendCfg.apiKey.startsWith('re_'));
  const maskedKey = hasKey
    ? `${resendCfg.apiKey.slice(0, 6)}...${resendCfg.apiKey.slice(-4)}`
    : 'none';

  const maskEmail = (em) => {
    if (!em || !em.includes('@')) return 'none';
    const [user, domain] = em.split('@');
    return `${user.slice(0, 2)}***@${domain}`;
  };

  const isProduction = process.env.NODE_ENV === 'production';
  const isSandbox = resendCfg.from.includes('resend.dev');

  return {
    ready: hasKey,
    apiKeyConfigured: hasKey,
    apiKeyMasked: maskedKey,
    fromEmail: resendCfg.from,
    testRecipientConfigured: Boolean(resendCfg.testRecipient),
    testRecipientMasked: maskEmail(resendCfg.testRecipient),
    isSandboxSender: isSandbox,
    isProduction,
    productionSenderReady: isProduction ? (!isSandbox && hasKey) : hasKey,
    message: hasKey
      ? (isProduction && isSandbox
          ? `[WARNING] Resend sender <${resendCfg.from}> is in sandbox mode. Production customer emails require a verified custom domain.`
          : `Resend ready with sender <${resendCfg.from}> (key: ${maskedKey})`)
      : 'Resend API key missing or invalid. Set RESEND_API_KEY to activate live email dispatch.',
  };
}

/**
 * Send an email via Resend with safe recipient handling and fallbacks.
 *
 * Safe sandbox rule:
 * In development / testing environments, if sender is in sandbox ('resend.dev'),
 * route safely to testRecipient to enable real email delivery without 403 API errors.
 * In production (NODE_ENV=production), test-recipient routing is strictly disabled
 * to prevent silent redirection of real customer emails.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  from,
  replyTo,
  tags = [],
}) {
  const config = checkResendConfig();
  const rawRecipient = Array.isArray(to) ? to[0] : to;
  const cleanRecipient = (rawRecipient || '').trim();

  if (!cleanRecipient) {
    return {
      success: false,
      error: 'Recipient email address is required.',
      status: 'failed',
    };
  }

  const sender = from || resendCfg.from || 'onboarding@resend.dev';
  const isSandbox = sender.includes('resend.dev');
  const isProduction = process.env.NODE_ENV === 'production';

  // Determine target recipient:
  // ONLY redirect to testRecipient if strictly in non-production mode!
  let targetTo = cleanRecipient;
  let routedToTest = false;

  if (!isProduction && isSandbox && resendCfg.testRecipient) {
    // If sending in sandbox to anything other than the test recipient, route safely
    if (cleanRecipient.toLowerCase() !== resendCfg.testRecipient.toLowerCase()) {
      targetTo = resendCfg.testRecipient;
      routedToTest = true;
    }
  }

  if (isProduction && isSandbox) {
    console.warn(
      `[Resend] Production Warning: Email to ${cleanRecipient} sent from sandbox sender ${sender}. ` +
      `Resend will reject customer delivery until a verified custom domain is configured in RESEND_FROM_EMAIL.`
    );
  }

  // Prepend notice if redirected for safe testing in dev
  let finalHtml = html;
  let finalText = text;
  if (routedToTest) {
    const banner = `
      <div style="background-color: #fef3c7; border: 1px solid #f59e0b; color: #92400e; padding: 12px 16px; margin-bottom: 20px; border-radius: 8px; font-family: sans-serif; font-size: 13px;">
        <strong>[Lunao Safe Test Delivery]</strong> This email was originally targeted for <strong>${cleanRecipient}</strong>, but was safely routed to your verified Resend test inbox (<code>${targetTo}</code>) because <code>${sender}</code> is in sandbox testing mode.
      </div>
    `;
    finalHtml = banner + html;
    finalText = `[Lunao Safe Test Delivery: Originally for ${cleanRecipient}]\n\n${text}`;
  }

  // Live Resend client dispatch
  const client = getResendClient();
  if (client) {
    try {
      const response = await client.emails.send({
        from: sender,
        to: targetTo,
        subject,
        html: finalHtml,
        text: finalText,
        reply_to: replyTo,
        tags,
      });

      if (response.error) {
        console.error('[Resend] Send error:', response.error);
        return {
          success: false,
          status: 'failed',
          error: response.error.message || 'Resend API returned an error',
          recipient: targetTo,
          originalRecipient: cleanRecipient,
        };
      }

      console.log(`[Resend] Email accepted for delivery (id: ${response.data?.id}) to ${targetTo} [original: ${cleanRecipient}]`);
      return {
        success: true,
        status: 'sent', // API accepted for transmission; delivered state confirmed only via webhook
        id: response.data?.id,
        recipient: targetTo,
        originalRecipient: cleanRecipient,
        routedToTest,
        sender,
      };
    } catch (err) {
      console.error('[Resend] Unexpected exception during send:', err.message);
      return {
        success: false,
        status: 'failed',
        error: err.message,
        recipient: targetTo,
        originalRecipient: cleanRecipient,
      };
    }
  }

  // Fallback when Resend key is not configured (offline / dry-run)
  console.warn(`[Resend:Simulated] Key not set. Would have sent "${subject}" to ${cleanRecipient}`);
  return {
    success: true,
    simulated: true,
    status: 'sent',
    id: `sim_${Date.now()}`,
    recipient: cleanRecipient,
    originalRecipient: cleanRecipient,
    sender,
  };
}
