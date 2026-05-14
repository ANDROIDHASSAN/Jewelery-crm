// Meta Cloud API client. Sends approved templates only. Twilio SMS fallback after 2 failures.

import { env } from '../env.js';
import { logger } from './logger.js';

export interface WhatsAppSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  variables: Record<string, string>,
): Promise<WhatsAppSendResult> {
  if (!env.WHATSAPP_API_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    logger.warn({ to, templateName }, '[whatsapp] credentials missing — simulating send');
    return { ok: true, messageId: `sim-${Date.now()}` };
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: Object.values(variables).map((v) => ({ type: 'text', text: v })),
              },
            ],
          },
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Meta ${res.status}: ${text.slice(0, 200)}` };
    }
    const json = (await res.json()) as { messages?: { id: string }[] };
    return { ok: true, messageId: json.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}

export async function sendSmsFallback(to: string, body: string): Promise<WhatsAppSendResult> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    logger.warn({ to }, '[sms] Twilio credentials missing — simulating');
    return { ok: true, messageId: `sim-sms-${Date.now()}` };
  }
  // Twilio: POST https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json
  // Body: From=+1... &To=...&Body=...
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, Body: body }).toString(),
    });
    if (!res.ok) return { ok: false, error: `Twilio ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}
