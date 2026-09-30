'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { Panel } from '@/components/fy/Surfaces';
import { Body } from '@/components/fy/Text';
import { Button } from '@/components/fy/Controls';
import { LanguageDial } from '@/components/fy/LanguageDial';
import { Wordmark } from '@/components/fy/Wordmark';

type Step = 'start' | 'complete' | 'done';

/**
 * P1.7 — a member whose leader has been running their account takes it over.
 * Public, since they have no login yet: code + their own phone first, then the
 * OTP sent to that phone and a password of their choosing.
 */
export default function ClaimAccountPage() {
  const t = useTranslations('proxyMembers');
  const [step, setStep] = useState<Step>('start');
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (step === 'start') {
        const res = await api.post<{ devOtp?: string }>('/api/proxy-claim/start', { code: code.trim(), phone: phone.trim() });
        setDevOtp(res.devOtp ?? null);
        setStep('complete');
      } else {
        await api.post('/api/proxy-claim/complete', { code: code.trim(), phone: phone.trim(), otp: otp.trim(), password });
        setStep('done');
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('failed'));
    } finally {
      setLoading(false);
    }
  }

  const inputClass = 'rounded-control border border-fy-muted/20 bg-fy-bone px-3 py-2.5 text-body text-fy-ink';

  return (
    <div className="min-h-screen bg-fy-bone flex flex-col">
      <header className="px-gutter pt-4 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 min-w-0">
          <Wordmark height={22} />
        </Link>
        <LanguageDial className="sm:block" />
      </header>

      <main className="flex-1 flex items-center justify-center px-gutter py-10">
        <Panel className="w-full max-w-sm flex flex-col gap-4">
          <h1 className="font-heading text-heading text-fy-ink leading-tight">{t('claimTitle')}</h1>

          {step === 'done' ? (
            <>
              <Body size="label">{t('claimDone')}</Body>
              <Link href="/login" className="font-body text-label font-semibold text-fy-brown hover:underline">
                {t('claimSignIn')}
              </Link>
            </>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-3">
              <Body size="label">{step === 'start' ? t('claimIntro') : t('claimOtpSent')}</Body>
              {step === 'start' ? (
                <>
                  <label className="flex flex-col gap-1.5">
                    <span className="font-body text-label text-fy-muted">{t('claimCodeLabel')}</span>
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      autoComplete="off"
                      required
                      className={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="font-body text-label text-fy-muted">{t('claimPhoneLabel')}</span>
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
                </>
              ) : (
                <>
                  {devOtp && <Body size="label">{t('claimDevOtp', { otp: devOtp })}</Body>}
                  <label className="flex flex-col gap-1.5">
                    <span className="font-body text-label text-fy-muted">{t('claimOtpLabel')}</span>
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      required
                      className={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="font-body text-label text-fy-muted">{t('claimPasswordLabel')}</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className={inputClass}
                    />
                  </label>
                </>
              )}

              {error && (
                <p role="alert" className="font-body text-label text-fy-brown">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={loading} className="w-full">
                {step === 'start' ? t('claimSend') : t('claimFinish')}
              </Button>
            </form>
          )}
        </Panel>
      </main>
    </div>
  );
}
