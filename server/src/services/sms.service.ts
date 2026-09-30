import { z } from 'zod';
import { env } from '../config/env';

/**
 * SMS through MSG91 or Twilio, chosen by SMS_PROVIDER. Off ('none') by default.
 *
 * In India a transactional SMS has to match a DLT-registered template, so the
 * messages here are FIXED templates with named variables, not free text. Each
 * template has an English, Telugu and Hindi wording. The same wording is what
 * gets registered on DLT; MSG91 is sent the id of the flow that maps to the
 * registered template, and Twilio is sent the rendered text.
 *
 * Nothing here throws. A send returns { ok, reason } and the caller decides
 * what a failure means (a reset code that cannot be sent is an error to the
 * person; a confirmation that cannot be sent is a log line).
 */
export type SmsLocale = 'en' | 'te' | 'hi';
export type SmsTemplateKey = 'otp' | 'password_reset' | 'booking_confirmed' | 'proxy_assignment';

interface SmsTemplate {
  /** Variable names, which must match the variables of the registered template (##NAME## on MSG91). */
  vars: string[];
  text: Record<SmsLocale, string>;
}

export const SMS_TEMPLATES: Record<SmsTemplateKey, SmsTemplate> = {
  otp: {
    vars: ['OTP'],
    text: {
      en: 'Your FYRO code is {OTP}. It works for 10 minutes. Do not share it with anyone.',
      te: 'మీ FYRO కోడ్ {OTP}. ఇది 10 నిమిషాలు పనిచేస్తుంది. దీన్ని ఎవరికీ చెప్పవద్దు.',
      hi: 'आपका FYRO कोड {OTP} है। यह 10 मिनट चलेगा। इसे किसी को न बताएँ।',
    },
  },
  password_reset: {
    vars: ['OTP'],
    text: {
      en: 'Your FYRO password reset code is {OTP}. It works for 10 minutes. If you did not ask for it, ignore this message.',
      te: 'మీ FYRO పాస్‌వర్డ్ రీసెట్ కోడ్ {OTP}. ఇది 10 నిమిషాలు పనిచేస్తుంది. మీరు అడగకపోతే ఈ సందేశాన్ని పట్టించుకోకండి.',
      hi: 'आपका FYRO पासवर्ड रीसेट कोड {OTP} है। यह 10 मिनट चलेगा। आपने न माँगा हो तो इस संदेश को अनदेखा करें।',
    },
  },
  booking_confirmed: {
    vars: ['WORKER', 'WHEN'],
    text: {
      en: 'Your FYRO booking is confirmed. {WORKER} will come {WHEN}.',
      te: 'మీ FYRO బుకింగ్ నిర్ధారించబడింది. {WORKER} {WHEN} వస్తారు.',
      hi: 'आपकी FYRO बुकिंग पक्की हो गई है। {WORKER} {WHEN} आएँगे।',
    },
  },
  proxy_assignment: {
    vars: ['MEMBER', 'WHEN', 'PLACE'],
    text: {
      en: 'FYRO: {MEMBER} has a job {WHEN} at {PLACE}. Please tell them.',
      te: 'FYRO: {MEMBER} కు {WHEN} {PLACE} వద్ద పని ఉంది. దయచేసి వారికి చెప్పండి.',
      hi: 'FYRO: {MEMBER} का {WHEN} {PLACE} पर काम है। कृपया उन्हें बता दें।',
    },
  },
};

// { "otp": { "en": "<MSG91 flow id>", "te": "...", "hi": "..." }, ... }
const templateIds = z.record(z.string(), z.record(z.string(), z.string()));

export type SmsProvider = 'none' | 'msg91' | 'twilio';

export function smsProvider(): SmsProvider {
  return env.SMS_PROVIDER ?? 'none';
}

export function smsReady(): boolean {
  const p = smsProvider();
  if (p === 'msg91') return Boolean(env.MSG91_AUTH_KEY);
  if (p === 'twilio') return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM);
  return false;
}

export type SmsResult = { ok: true; provider: SmsProvider } | { ok: false; reason: string };

/** 10-digit Indian mobile to E.164. Anything else (including a proxy placeholder) is not sendable. */
export function toE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}

export function render(key: SmsTemplateKey, vars: Record<string, string>, locale: SmsLocale): string {
  return SMS_TEMPLATES[key].text[locale].replace(/\{(\w+)\}/g, (_m, name: string) => vars[name] ?? '');
}

function flowIdFor(key: SmsTemplateKey, locale: SmsLocale): string | null {
  if (!env.SMS_TEMPLATE_IDS) return null;
  try {
    const all = templateIds.parse(JSON.parse(env.SMS_TEMPLATE_IDS));
    return all[key]?.[locale] ?? all[key]?.en ?? null;
  } catch {
    return null;
  }
}

async function post(url: string, init: RequestInit): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  return { ok: res.ok, status: res.status };
}

export async function sendSms(to: string, key: SmsTemplateKey, vars: Record<string, string>, locale: SmsLocale = 'en'): Promise<SmsResult> {
  const provider = smsProvider();
  if (!smsReady()) return { ok: false, reason: 'not_configured' };
  const e164 = toE164(to);
  if (!e164) return { ok: false, reason: 'not_a_mobile_number' };
  const missing = SMS_TEMPLATES[key].vars.filter((v) => vars[v] === undefined);
  if (missing.length > 0) return { ok: false, reason: `missing_variable_${missing[0]}` };

  try {
    if (provider === 'msg91') {
      const flowId = flowIdFor(key, locale);
      if (!flowId) return { ok: false, reason: 'no_template_id' };
      const res = await post('https://control.msg91.com/api/v5/flow/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authkey: env.MSG91_AUTH_KEY as string },
        body: JSON.stringify({
          template_id: flowId,
          short_url: '0',
          recipients: [{ mobiles: e164.replace('+', ''), ...vars }],
        }),
      });
      return res.ok ? { ok: true, provider } : { ok: false, reason: `msg91_http_${res.status}` };
    }

    // Twilio
    const form = new URLSearchParams({ To: e164, From: env.TWILIO_FROM as string, Body: render(key, vars, locale) });
    const basic = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
    const res = await post(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
      body: form.toString(),
    });
    return res.ok ? { ok: true, provider } : { ok: false, reason: `twilio_http_${res.status}` };
  } catch (err) {
    const name = (err as Error)?.name;
    return { ok: false, reason: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unreachable' };
  }
}
