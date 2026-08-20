'use client';

/**
 * OTP verification screen — UI-ONLY, intentionally disconnected.
 *
 * FYRO's real auth is phone + password (see /login and
 * server/src/controllers/auth.controller.ts) — there is no SMS/OTP-issuing
 * backend today. This screen exists to match the Stitch design
 * (design/stitch/.../otp_verification) and demonstrate the visual flow
 * (phone entry -> 4-digit code entry, with a countdown/resend affordance),
 * but it deliberately does NOT fake a working verification:
 *   - "Send code" does not call any API and no SMS is sent.
 *   - The 4-digit input never validates against a real code — any 4 digits
 *     just reveals the honest disclaimer below instead of pretending to
 *     sign the user in.
 *   - Nothing else in the app (login, signup) links to this route, so it
 *     can't be stumbled into as part of a real auth flow.
 * See TASK decision doc (chosen approach (a)) for why this was preferred
 * over wiring a real request-otp/verify-otp backend in this pass: there is
 * no SMS provider configured (server/.env has MOCK_EXTERNAL_SERVICES=true
 * but no provider), and a half-built OTP check is explicitly disallowed.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { ChevronLeftIcon } from '@/components/ui/icons';

const inputClass =
  'w-full min-h-[44px] px-4 py-2.5 rounded-md border border-border bg-background text-text-primary placeholder:text-text-muted/70 transition-colors duration-fast focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20';

const CODE_LENGTH = 4;
const RESEND_SECONDS = 30;

export default function OtpVerificationPage() {
  const t = useTranslations('shared.otp');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [verifyAttempted, setVerifyAttempted] = useState(false);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (step !== 'code' || secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [step, secondsLeft]);

  function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    // No API call — see file-level note. Purely a UI state transition.
    setStep('code');
    setSecondsLeft(RESEND_SECONDS);
    setVerifyAttempted(false);
  }

  function handleDigitChange(index: number, value: string) {
    const clean = value.replace(/[^0-9]/g, '').slice(-1);
    setDigits((d) => {
      const next = [...d];
      next[index] = clean;
      return next;
    });
    if (clean && index < CODE_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  const codeComplete = digits.every((d) => d !== '');

  return (
    <div className="relative min-h-screen flex flex-col px-6 py-8 overflow-hidden bg-background">
      <div className="flex items-center gap-3 mb-10">
        <Link
          href={step === 'code' ? '#' : '/role-selection'}
          onClick={
            step === 'code'
              ? (e) => {
                  e.preventDefault();
                  setStep('phone');
                }
              : undefined
          }
          aria-label={t('back')}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-raised border border-border shadow-sm hover:bg-surface transition-colors duration-fast"
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </Link>
        <span className="font-heading text-lg font-extrabold text-primary-600 tracking-tight">FYRO</span>
      </div>

      <div className="max-w-sm w-full mx-auto flex-1 flex flex-col">
        {step === 'phone' ? (
          <>
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-text-primary mb-2">
              {t('stepPhoneTitle')}
            </h1>
            <p className="text-text-muted mb-8">{t('stepPhoneSubtitle')}</p>
            <form onSubmit={handleSendCode} className="space-y-4">
              <input
                type="tel"
                placeholder={t('phonePlaceholder')}
                aria-label={t('phonePlaceholder')}
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
                required
              />
              <Button type="submit" size="lg" className="w-full">
                {t('sendCode')}
              </Button>
            </form>
          </>
        ) : (
          <>
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-text-primary mb-2">
              {t('stepCodeTitle')}
            </h1>
            <p className="text-text-muted mb-8">{t('sentTo', { phone: phone || '—' })}</p>

            <div className="flex justify-center gap-3 mb-6" role="group" aria-label={t('stepCodeTitle')}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputsRef.current[i] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  aria-label={`Digit ${i + 1}`}
                  className="w-14 h-14 text-center text-xl font-heading font-bold rounded-md border border-border bg-background text-text-primary focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20 transition-colors duration-fast"
                />
              ))}
            </div>

            <div className="text-center mb-6">
              {secondsLeft > 0 ? (
                <p className="text-sm text-text-muted">{t('resendIn', { seconds: secondsLeft })}</p>
              ) : (
                <button
                  type="button"
                  onClick={() => setSecondsLeft(RESEND_SECONDS)}
                  className="text-sm font-semibold text-primary-600 hover:underline"
                >
                  {t('resend')}
                </button>
              )}
            </div>

            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={!codeComplete}
              onClick={() => setVerifyAttempted(true)}
            >
              {t('verify')}
            </Button>

            <button
              type="button"
              onClick={() => setStep('phone')}
              className="text-sm font-medium text-text-muted hover:text-text-primary mt-4 mx-auto block"
            >
              {t('changeNumber')}
            </button>
          </>
        )}

        {/* Honest disclaimer — always visible, not just after a verify
            attempt, so this never reads as a working flow at a glance. */}
        <div
          className={`mt-8 rounded-md border border-border-strong bg-surface px-4 py-3.5 text-sm text-text-muted ${
            verifyAttempted ? 'animate-[fadeIn_200ms_ease-out]' : ''
          }`}
        >
          <p className="font-semibold text-text-primary mb-1">{t('disclaimerTitle')}</p>
          <p className="leading-relaxed">{t('disclaimer')}</p>
          <Link href="/login" className="inline-block mt-2 text-primary-600 font-semibold hover:underline">
            {t('backToLogin')}
          </Link>
        </div>
      </div>
    </div>
  );
}
