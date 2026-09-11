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
 *
 * Restyled onto the shared first-run shell so it matches the rest of the
 * flow; the disclaimer stays exactly as prominent as it was, because it is
 * the most important thing on the screen.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/fy/Controls';
import { OnboardingShell } from '@/components/auth/OnboardingShell';
import { SignupField, signupInputClass } from '@/components/auth/SignupShell';

const CODE_LENGTH = 4;
const RESEND_SECONDS = 30;

export default function OtpVerificationPage() {
  const t = useTranslations('shared.otp');
  const tf = useTranslations('shared.onboarding');
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
  const onCodeStep = step === 'code';

  return (
    <OnboardingShell
      backHref={onCodeStep ? undefined : '/role-selection'}
      backLabel={t('back')}
      step={onCodeStep ? '02 / 02' : '01 / 02'}
      eyebrow={tf('flowEyebrow')}
      title={onCodeStep ? t('stepCodeTitle') : t('stepPhoneTitle')}
      lede={onCodeStep ? undefined : t('stepPhoneSubtitle')}
      action={
        onCodeStep ? (
          <div className="flex flex-col gap-3">
            <Button className="w-full" disabled={!codeComplete} onClick={() => setVerifyAttempted(true)}>
              {t('verify')}
            </Button>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep('phone')}
                className="font-mono text-[11px] uppercase tracking-widest text-fy-muted hover:text-fy-ink transition-colors"
              >
                {t('changeNumber')}
              </button>
              <button
                type="button"
                disabled={secondsLeft > 0}
                onClick={() => setSecondsLeft(RESEND_SECONDS)}
                className="font-mono text-[11px] uppercase tracking-widest text-fy-brown font-semibold disabled:opacity-40"
              >
                {secondsLeft > 0 ? `${t('resend')} · ${secondsLeft}s` : t('resend')}
              </button>
            </div>
          </div>
        ) : (
          <Button className="w-full" trailingGlyph="arrow_forward" disabled={!phone.trim()} onClick={handleSendCode}>
            {t('sendCode')}
          </Button>
        )
      }
    >
      {onCodeStep ? (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-center gap-3">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputsRef.current[i] = el;
                }}
                value={d}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label={`${t('stepCodeTitle')} ${i + 1}`}
                className="w-16 h-20 text-center rounded-card border border-fy-brown/15 bg-fy-card font-heading text-heading text-fy-ink shadow-card outline-none focus:border-fy-brown focus:ring-2 focus:ring-fy-brown/15 transition-shadow"
              />
            ))}
          </div>

          {/* The honest disclaimer — this flow verifies nothing. */}
          {verifyAttempted && (
            <div
              role="alert"
              className="rounded-card border border-fy-brown/25 bg-fy-panel p-4 flex flex-col gap-2"
            >
              <span className="flex items-center gap-2">
                <span aria-hidden className="material-symbols-outlined text-[18px] text-fy-brown leading-none">
                  info
                </span>
                <span className="font-body text-body font-semibold text-fy-ink">{t('disclaimerTitle')}</span>
              </span>
              <p className="font-body text-label text-fy-ink-soft leading-relaxed">{t('disclaimer')}</p>
              <a
                href="/login"
                className="font-mono text-[11px] uppercase tracking-widest text-fy-brown font-semibold hover:underline underline-offset-2"
              >
                {t('backToLogin')}
              </a>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSendCode} className="bg-fy-card rounded-card p-5 shadow-card border border-fy-brown/12">
          <SignupField label={t('phonePlaceholder')}>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('phonePlaceholder')}
              className={signupInputClass}
            />
          </SignupField>
        </form>
      )}
    </OnboardingShell>
  );
}
