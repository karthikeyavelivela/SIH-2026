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
   enrolment shell with the facility's own fields, its name and address.
   Unchanged endpoint and payload. */

export default function SignupWarehouseHubPage() {
  const router = useRouter();
  const { refetch } = useAuth();
  const t = useTranslations('auth.signupWarehouseHub');

  const [form, setForm] = useState({ name: '', phone: '', password: '', hubName: '', address: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/api/auth/signup/warehouse-hub', form);
      await refetch();
      router.push('/warehouse-hub/dashboard');
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
      mediaId="warehouse.hero"
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

        <SignupField label={t('hubNamePlaceholder')}>
          <input
            required
            value={form.hubName}
            onChange={(e) => setForm((f) => ({ ...f, hubName: e.target.value }))}
            placeholder={t('hubNamePlaceholder')}
            className={signupInputClass}
          />
        </SignupField>

        <SignupField label={t('addressPlaceholder')}>
          <input
            required
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder={t('addressPlaceholder')}
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
