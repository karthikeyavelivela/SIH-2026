'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { useAuth, AuthUser } from '@/lib/auth-context';
import { roleHome } from '@/lib/roleHome';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Divider } from '@/components/fy/Surfaces';
import { EyebrowLabel, DisplayHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { Button } from '@/components/fy/Controls';
import { PhotoCard } from '@/components/fy/Media';
import { BottomTabBar } from '@/components/fy/Navigation';

/* Built against design-reference/login.png.
   Section order there, top to bottom: brand header -> photo card with a
   floating "passbook dispatch ready" pill -> display heading -> body ->
   WHITE form panel (protocol row, contact field, passkey field, retain
   row, brown CTA, "alternative access" hairline divider, two light
   buttons, light sub-card with the green charter CTA) -> light footer
   card -> 5-item bottom bar. The display heading is the largest element. */

export default function LoginPage() {
  const router = useRouter();
  const { refetch } = useAuth();
  const t = useTranslations('auth.login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPasskey, setShowPasskey] = useState(false);
  const [retain, setRetain] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ user: AuthUser }>('/api/auth/login', { phone, password });
      await refetch();
      router.push(roleHome(res.user.role));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('genericError'));
    } finally {
      setLoading(false);
    }
  }

  // The design shows biometric, SMS-OTP and passkey-reset entry points.
  // None of the three exists server-side, so rather than fake a flow they
  // say so plainly — see the report for the list of gaps this surfaces.
  const unavailable = () => setNotice(t('notAvailable'));

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div className="fixed inset-0 pointer-events-none fy-grain opacity-40 z-0" />

      <header className="sticky top-0 z-30 bg-fy-bone/88 backdrop-blur-xl border-b border-fy-hairline/40">
        <div className="h-16 max-w-2xl mx-auto px-gutter flex items-center justify-between gap-3">
          <Link href="/" className="flex flex-col leading-none min-w-0" aria-label={t('backToHome')}>
            <span className="font-heading text-title text-fy-brown">FYRO</span>
            <EyebrowLabel className="mt-0.5">{t('brandSub')}</EyebrowLabel>
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            <span className="px-3 py-1.5 rounded-full bg-fy-field font-body text-label text-fy-ink-soft">
              EN <span className="text-fy-hairline">/</span> తె <span className="text-fy-hairline">/</span> हि
            </span>
            <span className="w-9 h-9 rounded-full bg-fy-brown-soft text-fy-on-brown flex items-center justify-center">
              <Icon name="person" size={18} />
            </span>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-2xl mx-auto px-gutter pt-4 pb-28 flex flex-col gap-4">
        <LightCard className="p-0 overflow-hidden">
          <PhotoCard
            id="login.hero"
            alt="Cooperative members at a mandi counter"
            height="banner"
            scrim="none"
            className="rounded-none"
            topLeft={
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-fy-bone/92 backdrop-blur-sm font-body text-eyebrow uppercase text-fy-ink">
                <span className="w-1.5 h-1.5 rounded-full bg-fy-green" aria-hidden="true" />
                {t('heroBadge')}
              </span>
            }
          />
          <div className="p-4">
            <DisplayHeading>{t('title')}</DisplayHeading>
            <Body size="body-lg" className="mt-2">
              {t('subtitle')}
            </Body>
          </div>
        </LightCard>

        <Panel className="p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 min-w-0 flex-1">
              <Icon name="badge" size={20} className="text-fy-ink shrink-0" />
              <EyebrowLabel tone="ink" className="truncate">{t('protocol')}</EyebrowLabel>
            </span>
            <StatusPill tone="lime" className="shrink-0">{t('secureGate')}</StatusPill>
          </div>

          <Divider className="my-3" />

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <label htmlFor="phone" className="font-body text-body font-semibold text-fy-ink min-w-0">
                  {t('contactLabel')}
                </label>
                <span className="font-body text-label text-fy-muted whitespace-nowrap shrink-0">{t('contactHint')}</span>
              </div>
              <div className="flex items-center h-14 rounded-control bg-fy-field px-4 gap-3">
                <span className="font-body text-body font-semibold text-fy-ink shrink-0">
                  IND <span className="text-fy-brown">+91</span>
                </span>
                <span className="w-px h-6 bg-fy-hairline shrink-0" aria-hidden="true" />
                <input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder={t('phonePlaceholder')}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none font-body text-body text-fy-ink placeholder:text-fy-muted/70"
                />
                <Icon name="contact_page" size={20} className="text-fy-ink-soft shrink-0" />
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <label htmlFor="passkey" className="font-body text-body font-semibold text-fy-ink">
                  {t('passkeyLabel')}
                </label>
                <button
                  type="button"
                  onClick={unavailable}
                  className="font-body text-label font-semibold text-fy-brown hover:underline"
                >
                  {t('forgotPasskey')}
                </button>
              </div>
              <div className="flex items-center h-14 rounded-control bg-fy-field px-4 gap-3">
                <Icon name="lock" size={20} className="text-fy-ink-soft shrink-0" />
                <input
                  id="passkey"
                  type={showPasskey ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder={t('passkeyPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none font-body text-body text-fy-ink placeholder:text-fy-muted/70"
                />
                <button
                  type="button"
                  onClick={() => setShowPasskey((v) => !v)}
                  aria-label={showPasskey ? 'Hide passkey' : 'Show passkey'}
                  className="shrink-0 text-fy-ink-soft hover:text-fy-ink"
                >
                  <Icon name={showPasskey ? 'visibility_off' : 'visibility'} size={20} />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setRetain((v) => !v)}
              aria-pressed={retain}
              className="flex items-center gap-3 h-14 rounded-control bg-fy-field px-4 text-left"
            >
              <span
                className={`w-6 h-6 rounded-cell flex items-center justify-center shrink-0 ${
                  retain ? 'bg-fy-ink text-fy-bone' : 'border border-fy-hairline'
                }`}
              >
                {retain && <Icon name="check" size={16} />}
              </span>
              <span className="flex-1 font-body text-body text-fy-ink">{t('retain')}</span>
              <Icon name="encrypted" size={20} className="text-fy-green shrink-0" />
            </button>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-control bg-fy-error-bg px-4 py-3 font-body text-label text-fy-on-error-bg"
              >
                <Icon name="error" size={18} className="shrink-0 mt-px" />
                <p>{error}</p>
              </div>
            )}
            {notice && (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-control bg-fy-well px-4 py-3 font-body text-label text-fy-ink-soft"
              >
                <Icon name="info" size={18} className="shrink-0 mt-px" />
                <p>{notice}</p>
              </div>
            )}

            <Button type="submit" disabled={loading} glyph="key" className="w-full">
              {loading ? t('submitLoading') : t('submit')}
            </Button>
          </form>

          <div className="flex items-center gap-3 my-4">
            <span className="h-px flex-1 bg-fy-hairline/60" />
            <EyebrowLabel>{t('altAccess')}</EyebrowLabel>
            <span className="h-px flex-1 bg-fy-hairline/60" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="light" size="md" glyph="fingerprint" onClick={unavailable}>
              {t('biometric')}
            </Button>
            <Button variant="light" size="md" glyph="sms" onClick={unavailable}>
              {t('smsOtp')}
            </Button>
          </div>

          <div className="mt-3 rounded-card bg-fy-panel p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-heading text-title text-fy-ink leading-tight">{t('firstTime')}</p>
              <p className="font-body text-label text-fy-ink-soft mt-0.5">{t('firstTimeSub')}</p>
            </div>
            <Link href="/signup/customer" className="shrink-0">
              <Button variant="green" size="md" trailingGlyph="arrow_forward">
                {t('requestCharter')}
              </Button>
            </Link>
          </div>
        </Panel>

        <LightCard className="flex items-start gap-3">
          <Icon name="verified_user" size={22} className="text-fy-brown shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-body text-body font-semibold text-fy-ink">{t('ledgerTitle')}</p>
            <Body size="label" className="mt-1">
              {t('ledgerBody')}
            </Body>
          </div>
        </LightCard>
      </main>

      <BottomTabBar
        items={[
          { href: '/', label: 'Platform', glyph: 'grid_view' },
          { href: '/how-it-works', label: 'How It Works', glyph: 'account_tree' },
          { href: '/pricing', label: 'Pricing', glyph: 'payments' },
          { href: '/about', label: 'About', glyph: 'groups' },
          { href: '/safety', label: 'Safety', glyph: 'verified_user' },
        ]}
      />
    </div>
  );
}
