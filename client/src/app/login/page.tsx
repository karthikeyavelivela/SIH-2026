'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { useAuth, AuthUser } from '@/lib/auth-context';
import { roleHome } from '@/lib/roleHome';
import { Icon } from '@/components/ui/Icon';
import { Panel } from '@/components/fy/Surfaces';
import { Body } from '@/components/fy/Text';
import { Button } from '@/components/fy/Controls';
import { LanguageDial } from '@/components/fy/LanguageDial';
import { Wordmark } from '@/components/fy/Wordmark';

/**
 * Sign in. One screen, one job.
 *
 * The previous version was built literally from the design export and carried
 * everything in it: a hero photo, a "passbook dispatch ready" pill, a retain-
 * session row, a biometric button, an SMS-OTP button — both of which only
 * announced that they do not exist — a passkey visibility toggle, a charter
 * sub-card, a footer assurance card and a five-item bottom bar. Nine things
 * competing with the two fields somebody actually came here to fill in.
 *
 * What is here now: phone, password, a prominent "forgot password", one
 * primary button, one link for people without an account, and the language
 * dial. Nothing else.
 *
 * Role is not chosen here and never was — it is derived from the account, and
 * the redirect after sign-in uses it. Offering a role picker at sign-in would
 * invite people to pick the wrong one and then wonder why the app looks
 * strange.
 */
export default function LoginPage() {
  const router = useRouter();
  const { refetch } = useAuth();
  const t = useTranslations('signIn');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      // The server's message is specific and safe to show ("Invalid
      // credentials" never says which of the two was wrong), so it is shown
      // as-is rather than replaced with something vaguer.
      setError(err instanceof ApiClientError ? err.message : t('error'));
    } finally {
      setLoading(false);
    }
  }

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
          <h1 className="font-heading text-heading text-fy-ink leading-tight">{t('heading')}</h1>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-label text-fy-muted">{t('phone')}</span>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="min-h-[48px] px-3.5 rounded-control border border-fy-brown/20 bg-fy-bone font-body text-body text-fy-ink focus:border-fy-brown focus:outline-none focus:ring-2 focus:ring-fy-brown/20"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-body text-label text-fy-muted">{t('password')}</span>
              <span className="relative flex items-center">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full min-h-[48px] px-3.5 pr-11 rounded-control border border-fy-brown/20 bg-fy-bone font-body text-body text-fy-ink focus:border-fy-brown focus:outline-none focus:ring-2 focus:ring-fy-brown/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={t('password')}
                  className="absolute right-2 w-9 h-9 flex items-center justify-center rounded-full hover:bg-fy-field"
                >
                  <Icon name={showPassword ? 'visibility_off' : 'visibility'} size={18} className="text-fy-muted" />
                </button>
              </span>
            </label>

            {error && (
              <p role="alert" className="font-body text-label text-fy-brown">
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading} glyph="login" className="w-full">
              {loading ? t('signingIn') : t('signIn')}
            </Button>
          </form>

          <Link
            href="/forgot-password"
            className="font-body text-label font-semibold text-fy-brown hover:underline text-center"
          >
            {t('forgot')}
          </Link>

          <div className="border-t border-fy-brown/12 pt-4 text-center">
            <Link href="/role-selection" className="font-body text-label font-semibold text-fy-brown hover:underline">
              {t('newHere')}
            </Link>
          </div>
        </Panel>
      </main>

      <footer className="px-gutter pb-6 text-center">
        <Body size="label">
          <Link href="/how-it-works" className="hover:underline">
            FYRO
          </Link>
        </Body>
      </footer>
    </div>
  );
}
