'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/fy/Controls';
import { SignupShell, SignupField, signupInputClass } from '@/components/auth/SignupShell';

/* Built against client/public/design/signup_business.html — the shared
   enrolment shell with the operator's own field, the fleet's name.
   Unchanged endpoint and payload. */

export default function SignupFleetOwnerPage() {
  const router = useRouter();
  const { refetch } = useAuth();
  const t = useTranslations('auth.signupFleetOwner');

  const [form, setForm] = useState({ name: '', phone: '', password: '', fleetName: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/api/auth/signup/fleet-owner', form);
      await refetch();
      router.push('/fleet-owner/dashboard');
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
      mediaId="landing.guild.transport"
      tint="transport"
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

        <SignupField label={t('fleetNamePlaceholder')}>
          <input
            required
            value={form.fleetName}
            onChange={(e) => setForm((f) => ({ ...f, fleetName: e.target.value }))}
            placeholder={t('fleetNamePlaceholder')}
            className={signupInputClass}
          />
        </SignupField>

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
          {t('submit')}
        </Button>
      </form>
    </SignupShell>
  );
}
