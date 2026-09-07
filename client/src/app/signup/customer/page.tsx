'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { setLocaleAction } from '@/i18n/setLocale';
import { LanguagePill, type LanguageCode } from '@/components/ui/LanguagePill';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, DisplayHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { Button, Field } from '@/components/fy/Controls';
import { TopBar } from '@/components/fy/Navigation';

/* Built against client/public/design/signup_customer.html.

   Section order there, top to bottom: brand bar with the EN / తె / हि
   switcher -> "Member Registry · Form No. 16-C" eyebrow over "Hirer
   Enrollment" -> a three-step indicator (Identity / Verify / Region) ->
   "Step 1 of 3" pill -> display heading and the zero-surge-markup promise
   -> full legal name -> handset mobile with the +91 prefix block ->
   primary mandi / transit hub select -> audio & dispatch language ->
   submit.

   Largest element: the display heading. Dark surfaces: the submit button.
   Brown is the accent throughout.

   Two deviations, both because the backend says so:

   1. The design's three-step indicator promises an OTP verification step
      and a separate region step. POST /api/auth/signup/customer creates
      the account in one call and there is no OTP endpoint anywhere in the
      server, so this is one step. Showing "Step 1 of 3" over a form that
      finishes in one step would be a lie about what happens next.
   2. The design's hub picker lists five named terminals. Nothing seeds
      terminals; the real geography the platform knows is the six state
      federations, so that is what the picker offers, and it maps to the
      User.region field the matching engine actually reads. */

const STATE_KEYS = ['andhraPradesh', 'telangana', 'karnataka', 'tamilNadu', 'maharashtra', 'kerala'] as const;

export default function SignupCustomerPage() {
  const router = useRouter();
  const { refetch } = useAuth();
  const t = useTranslations('auth.signupCustomer');
  const tm = useTranslations('marketing.home');
  const locale = useLocale() as LanguageCode;
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', region: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/api/auth/signup/customer', form);
      await refetch();
      router.push('/customer/dashboard');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('genericError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar
        eyebrow="FYRO"
        title={t('brandSub')}
        showBack
        onBack={() => router.push('/')}
        actions={
          <LanguagePill
            size="compact"
            value={locale}
            onChange={(code) => {
              if (code !== locale) void setLocaleAction(code).then(() => router.refresh());
            }}
          />
        }
      />

      <main className="pt-16 pb-16 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 pt-2">
          <EyebrowLabel tone="brown">{t('eyebrow')}</EyebrowLabel>
          <StatusPill tone="lime" className="shrink-0">
            {t('oneStep')}
          </StatusPill>
        </div>

        <div>
          <DisplayHeading size="heading">{t('title')}</DisplayHeading>
          <Body size="body-lg" className="mt-2">
            {t('subtitle')}
          </Body>
        </div>

        <LightCard className="flex items-start gap-3">
          <IconTile tone="lime" size="sm">
            <Icon name="verified" size={18} />
          </IconTile>
          <Body size="label">{t('noSurgePromise')}</Body>
        </LightCard>

        <Panel className="p-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <EyebrowLabel tone="ink">{t('nameLabel')}</EyebrowLabel>
              <Field
                placeholder={t('namePlaceholder')}
                aria-label={t('nameLabel')}
                autoComplete="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-2">
                <EyebrowLabel tone="ink">{t('phoneLabel')}</EyebrowLabel>
                <EyebrowLabel>{t('phoneHint')}</EyebrowLabel>
              </div>
              <div className="flex items-center h-14 rounded-control bg-fy-field px-4 gap-3">
                <span className="font-body text-body font-semibold text-fy-ink shrink-0">
                  IND <span className="text-fy-brown">+91</span>
                </span>
                <span aria-hidden className="w-px h-6 bg-fy-hairline shrink-0" />
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder={t('phonePlaceholder')}
                  aria-label={t('phoneLabel')}
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  required
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none font-body text-body text-fy-ink placeholder:text-fy-muted/70"
                />
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-2">
                <EyebrowLabel tone="ink">{t('regionLabel')}</EyebrowLabel>
                <EyebrowLabel>{t('optional')}</EyebrowLabel>
              </div>
              <select
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                aria-label={t('regionLabel')}
                className="w-full h-14 px-4 rounded-control bg-fy-field font-body text-body text-fy-ink outline-none border-0 focus:ring-2 focus:ring-fy-brown/25"
              >
                <option value="">{t('regionPlaceholder')}</option>
                {STATE_KEYS.map((k) => (
                  <option key={k} value={tm(`states.${k}`)}>
                    {tm(`states.${k}`)}
                  </option>
                ))}
              </select>
              <Body size="label" className="mt-1">
                {t('regionHint')}
              </Body>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-2">
                <EyebrowLabel tone="ink">{t('emailLabel')}</EyebrowLabel>
                <EyebrowLabel>{t('optional')}</EyebrowLabel>
              </div>
              <Field
                type="email"
                placeholder={t('emailPlaceholder')}
                aria-label={t('emailLabel')}
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div>
              <EyebrowLabel tone="ink">{t('passwordLabel')}</EyebrowLabel>
              <Field
                type="password"
                placeholder={t('passwordPlaceholder')}
                aria-label={t('passwordLabel')}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={8}
              />
              <Body size="label" className="mt-1">
                {t('passwordHint')}
              </Body>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-control bg-fy-error-bg px-4 py-3 font-body text-label text-fy-on-error-bg"
              >
                <Icon name="error" size={18} className="shrink-0 mt-px" />
                <p>{error}</p>
              </div>
            )}

            <Button type="submit" disabled={loading} glyph="how_to_reg" className="w-full">
              {loading ? t('submitLoading') : t('submit')}
            </Button>
          </form>

          <Divider className="my-4" />

          <Body size="label">
            {t('loginPrompt')}{' '}
            <Link href="/login" className="font-semibold text-fy-brown hover:underline">
              {t('loginLink')}
            </Link>
          </Body>
        </Panel>
      </main>
    </div>
  );
}
