'use client';

import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { Panel } from '@/components/fy/Surfaces';
import { Body } from '@/components/fy/Text';
import { Button } from '@/components/fy/Controls';

/**
 * What happens when somebody forgets their password.
 *
 * When a code can really reach a phone (an SMS provider is set up on the
 * server), this is the real flow: phone, then the code and a new password.
 * When it cannot, it says what is true and points at the humans who can help,
 * because a form that collects a phone number and then does nothing would look
 * like help and not be.
 */
type Step = 'phone' | 'code' | 'done';

export default function ForgotPasswordPage() {
  const t = useTranslations('signIn');
  const tr = useTranslations('passwordReset');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ available: boolean }>('/api/auth/forgot-password/status').then((r) => setAvailable(r.available)).catch(() => setAvailable(false));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step === 'phone') {
        const res = await api.post<{ devOtp?: string }>('/api/auth/forgot-password/start', { phone: phone.trim() });
        setDevOtp(res.devOtp ?? null);
        setStep('code');
      } else {
        await api.post('/api/auth/forgot-password/complete', { phone: phone.trim(), otp: otp.trim(), newPassword: password });
        setStep('done');
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : tr('failed'));
    } finally {
      setBusy(false);
    }
  }

  const inputClass = 'rounded-control border border-fy-muted/20 bg-fy-bone px-3 py-2.5 text-body text-fy-ink';

  return (
    <div className="min-h-screen bg-fy-bone flex items-center justify-center px-gutter py-10">
      <Panel className="w-full max-w-sm flex flex-col gap-4">
        <span className="w-11 h-11 rounded-full bg-fy-brown/10 text-fy-brown flex items-center justify-center">
          <Icon name="lock_reset" size={22} />
        </span>
        <h1 className="font-heading text-title text-fy-ink leading-tight">{t('forgotHeading')}</h1>

        {available === null ? null : !available ? (
          <>
            <Body size="label">{t('forgotBody')}</Body>
            <Body size="label">{t('forgotWho')}</Body>
          </>
        ) : step === 'done' ? (
          <Body size="label">{tr('done')}</Body>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Body size="label">{step === 'phone' ? tr('intro') : tr('sent')}</Body>
            {step === 'phone' ? (
              <label className="flex flex-col gap-1.5">
                <span className="font-body text-label text-fy-muted">{tr('phone')}</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  required
                  className={inputClass}
                />
              </label>
            ) : (
              <>
                {devOtp && <Body size="label">{tr('devCode', { otp: devOtp })}</Body>}
                <label className="flex flex-col gap-1.5">
                  <span className="font-body text-label text-fy-muted">{tr('otp')}</span>
                  <input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} required className={inputClass} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-body text-label text-fy-muted">{tr('newPassword')}</span>
                  <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required className={inputClass} />
                </label>
              </>
            )}
            {error && (
              <p role="alert" className="font-body text-label text-fy-brown">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy} className="w-full">
              {step === 'phone' ? tr('send') : tr('submit')}
            </Button>
          </form>
        )}

        <Link href="/login" className="font-body text-label font-semibold text-fy-brown hover:underline">
          {t('forgotBack')}
        </Link>
      </Panel>
    </div>
  );
}
