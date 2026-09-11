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
   enrolment shell (trade plate, charter head, white form panel) with the
   driver's own fields: vehicle class, capacity and registration. Unchanged
   endpoint and payload; only the presentation moved onto the shell. */

const VEHICLE_VALUES = ['mini_truck', 'medium_truck', 'large_truck'] as const;

const VEHICLE_LABEL_KEY: Record<(typeof VEHICLE_VALUES)[number], string> = {
  mini_truck: 'miniTruck',
  medium_truck: 'mediumTruck',
  large_truck: 'largeTruck',
};

export default function SignupDriverPage() {
  const router = useRouter();
  const { refetch } = useAuth();
  const t = useTranslations('auth.signupDriver');

  const [form, setForm] = useState({
    name: '',
    phone: '',
    password: '',
    vehicleType: 'mini_truck',
    capacityKg: '',
    registrationNumber: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/api/auth/signup/driver', { ...form, capacityKg: Number(form.capacityKg) });
      await refetch();
      router.push('/driver/dashboard');
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

        <SignupField label={t('vehicleTypeLabel')}>
          <div className="grid grid-cols-3 gap-2">
            {VEHICLE_VALUES.map((v) => {
              const on = form.vehicleType === v;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setForm((f) => ({ ...f, vehicleType: v }))}
                  className={`min-h-[48px] px-2 rounded-cell font-body text-label transition-colors ${
                    on
                      ? 'bg-fy-slate text-fy-on-slate font-semibold'
                      : 'bg-fy-well text-fy-ink-soft hover:bg-fy-edge'
                  }`}
                >
                  {t(`vehicleOptions.${VEHICLE_LABEL_KEY[v]}`)}
                </button>
              );
            })}
          </div>
        </SignupField>

        <div className="grid grid-cols-2 gap-3">
          <SignupField label={t('capacityPlaceholder')}>
            <input
              required
              type="number"
              min={1}
              value={form.capacityKg}
              onChange={(e) => setForm((f) => ({ ...f, capacityKg: e.target.value }))}
              placeholder={t('capacityPlaceholder')}
              className={signupInputClass}
            />
          </SignupField>
          <SignupField label={t('registrationPlaceholder')}>
            <input
              required
              value={form.registrationNumber}
              onChange={(e) => setForm((f) => ({ ...f, registrationNumber: e.target.value }))}
              placeholder={t('registrationPlaceholder')}
              className={signupInputClass}
            />
          </SignupField>
        </div>

        <Button type="submit" className="w-full mt-1" disabled={loading}>
          {loading ? t('submitLoading') : t('submit')}
        </Button>
      </form>
    </SignupShell>
  );
}
