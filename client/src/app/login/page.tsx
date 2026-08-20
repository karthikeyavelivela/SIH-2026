'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { useAuth, AuthUser } from '@/lib/auth-context';
import { roleHome } from '@/lib/roleHome';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ChevronLeftIcon } from '@/components/ui/icons';

const inputClass =
  'w-full min-h-[44px] px-4 py-2.5 rounded-md border border-border bg-background text-text-primary placeholder:text-text-muted/70 transition-colors duration-fast focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20';

export default function LoginPage() {
  const router = useRouter();
  const { refetch } = useAuth();
  const t = useTranslations('auth.login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
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
      setError(err instanceof ApiClientError ? err.message : t('genericError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-6 py-12 overflow-hidden bg-background">
      <Link
        href="/"
        aria-label={t('backToHome')}
        className="absolute top-5 left-5 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-surface-raised border border-border shadow-sm hover:bg-surface transition-colors duration-fast"
      >
        <ChevronLeftIcon className="w-5 h-5" />
      </Link>
      <div
        className="pointer-events-none absolute -top-32 -left-24 w-80 h-80 rounded-full bg-primary/10 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-32 -right-24 w-80 h-80 rounded-full bg-secondary/10 blur-3xl"
        aria-hidden="true"
      />

      <Card elevation="raised" className="w-full max-w-sm relative z-10 animate-[fadeUp_600ms_ease-out]">
        <p className="font-heading text-xs font-bold uppercase tracking-[0.2em] text-primary-600 mb-2">
          {t('eyebrow')}
        </p>
        <h1 className="font-heading text-2xl font-bold mb-1">{t('title')}</h1>
        <p className="text-sm text-text-muted mb-7">{t('subtitle')}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
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
          <input
            type="password"
            placeholder={t('passwordPlaceholder')}
            aria-label={t('passwordPlaceholder')}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            required
          />
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 animate-[fadeIn_200ms_ease-out]"
            >
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M18 10A8 8 0 112 10a8 8 0 0116 0zm-7-4a1 1 0 10-2 0v4a1 1 0 102 0V6zm-1 8a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
              <p>{error}</p>
            </div>
          )}
          <Button type="submit" disabled={loading} className="w-full" size="lg">
            {loading ? t('submitLoading') : t('submit')}
          </Button>
        </form>
        <p className="text-sm text-text-muted mt-7 pt-6 border-t border-border">
          {t('signupPrompt')}{' '}
          <Link href="/signup/customer" className="text-primary-600 font-semibold hover:underline">
            {t('signupLink')}
          </Link>
        </p>
      </Card>
    </div>
  );
}
