'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/fy/Controls';
import { SignupShell, SignupField, signupInputClass } from '@/components/auth/SignupShell';

/* Built against client/public/design/signup_worker.html — the shared
   enrolment shell, plus the one decision that makes this signup different
   from the driver's: whether the worker is enrolling alone, founding a
   society, or joining one on an invite code. That choice changes both the
   extra field shown and where the new member lands, so it is the first
   thing on the form rather than a dropdown buried under the name field.
   Unchanged endpoint, payload and routing. */

type JoinType = 'solo' | 'leader' | 'member';

const JOIN_TYPES: JoinType[] = ['solo', 'leader', 'member'];

const JOIN_GLYPH: Record<JoinType, string> = {
  solo: 'person',
  leader: 'groups',
  member: 'diversity_3',
};

export default function SignupHamaliPage() {
  const router = useRouter();
  const { refetch } = useAuth();
  const t = useTranslations('auth.signupHamali');

  const [joinType, setJoinType] = useState<JoinType>('solo');
  const [form, setForm] = useState({ name: '', phone: '', password: '', muthaName: '', inviteCode: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/api/auth/signup/hamali', { ...form, joinType });
      await refetch();
      const home =
        joinType === 'solo' ? '/hamali/dashboard' : joinType === 'leader' ? '/mutha/dashboard' : '/mutha-member/job';
      router.push(home);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('genericError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SignupShell
      eyebrow={t('eyebrow')}
      title={t('title')}
      lede={t('subtitle')}
      mediaId="landing.guild.hamali"
      tint="labour"
      stamp={t('eyebrow')}
      footer={
        <p className="text-center font-body text-label text-fy-ink-soft">
          {t('loginPrompt')}{' '}
          <Link href="/login" className="text-fy-brown font-semibold hover:underline underline-offset-2">
            {t('loginLink')}
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div role="alert" className="rounded-cell bg-fy-error-bg px-4 py-3 font-body text-label text-fy-on-error-bg">
            {error}
          </div>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="font-mono text-[10px] uppercase tracking-widest text-fy-muted font-semibold mb-1.5">
            {t('joinTypeAria')}
          </legend>
          {JOIN_TYPES.map((j) => {
            const on = joinType === j;
            return (
              <button
                key={j}
                type="button"
                aria-pressed={on}
                onClick={() => setJoinType(j)}
                className={`w-full text-left rounded-cell border px-4 py-3 transition-colors flex items-start justify-between gap-3 ${
                  on ? 'border-fy-green bg-fy-lime-tint-1' : 'border-fy-brown/15 bg-fy-well hover:border-fy-brown/40'
                }`}
              >
                <span className="flex items-start gap-3 min-w-0">
                  <span
                    aria-hidden
                    className={`material-symbols-outlined text-[20px] leading-none mt-0.5 shrink-0 ${
                      on ? 'text-fy-green' : 'text-fy-muted'
                    }`}
                  >
                    {JOIN_GLYPH[j]}
                  </span>
                  <span className="flex flex-col min-w-0">
                    <span className="font-body text-body font-semibold text-fy-ink">
                      {t(`joinTypes.${j}.label`)}
                    </span>
                    <span className="font-body text-label text-fy-ink-soft">{t(`joinTypes.${j}.hint`)}</span>
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`material-symbols-outlined text-[20px] leading-none shrink-0 ${
                    on ? 'text-fy-green' : 'text-fy-hairline'
                  }`}
                >
                  {on ? 'check_circle' : 'radio_button_unchecked'}
                </span>
              </button>
            );
          })}
        </fieldset>

        {joinType === 'leader' && (
          <SignupField label={t('muthaNamePlaceholder')}>
            <input
              required
              value={form.muthaName}
              onChange={(e) => setForm((f) => ({ ...f, muthaName: e.target.value }))}
              placeholder={t('muthaNamePlaceholder')}
              className={signupInputClass}
            />
          </SignupField>
        )}

        {joinType === 'member' && (
          <SignupField label={t('inviteCodePlaceholder')}>
            <input
              required
              value={form.inviteCode}
              onChange={(e) => setForm((f) => ({ ...f, inviteCode: e.target.value }))}
              placeholder={t('inviteCodePlaceholder')}
              className={signupInputClass}
            />
          </SignupField>
        )}

        <SignupField label={t('namePlaceholder')}>
          <input
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={t('namePlaceholder')}
            className={signupInputClass}
          />
        </SignupField>

        <SignupField label={t('phonePlaceholder')}>
          <input
            required
            type="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder={t('phonePlaceholder')}
            className={signupInputClass}
          />
        </SignupField>

        <SignupField label={t('passwordPlaceholder')}>
          <input
            required
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder={t('passwordPlaceholder')}
            className={signupInputClass}
          />
        </SignupField>

        <Button type="submit" className="w-full mt-1" disabled={loading}>
          {loading ? t('submitLoading') : t('submit')}
        </Button>
      </form>
    </SignupShell>
  );
}
