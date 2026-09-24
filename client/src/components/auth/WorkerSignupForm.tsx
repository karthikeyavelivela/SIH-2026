'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { roleHome } from '@/lib/roleHome';
import { Button } from '@/components/fy/Controls';
import { Icon } from '@/components/ui/Icon';
import { SignupShell, SignupField, signupInputClass } from '@/components/auth/SignupShell';
import { TRADE_GLYPH, TRADE_SKILLS } from '@/lib/workerArea';

/**
 * Enrolment for a skilled household worker or a farm labourer.
 *
 * Both become solo workers on the same dispatch engine as loading workers;
 * what differs is the kind, which decides which jobs reach them. So the one
 * question that matters for a skilled worker — which trades — is on this
 * form and required: a skilled worker with no trade could never be offered
 * a job, and it is better to say so here than on an empty dashboard.
 *
 * Signs in on success and lands in the worker's own area (/skilled or
 * /agri), routed from what the server says the session is, not from what
 * this form assumes.
 */
export function WorkerSignupForm({ kind }: { kind: 'skilled' | 'agri' }) {
  const router = useRouter();
  const { refetch } = useAuth();
  const t = useTranslations('workerSignup');
  const tk = useTranslations('workerKinds');
  const [form, setForm] = useState({ name: '', phone: '', password: '' });
  const [trades, setTrades] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggle(s: string) {
    setTrades((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (kind === 'skilled' && trades.length === 0) {
      setError(t('pickTrade'));
      return;
    }
    setLoading(true);
    try {
      await api.post('/api/auth/signup/hamali', {
        ...form,
        joinType: 'solo',
        workerKind: kind,
        ...(kind === 'skilled' ? { skills: trades } : {}),
      });
      const me = await refetch();
      router.push(me ? roleHome(me.role, me.workerKind) : '/login');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('genericError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SignupShell
      eyebrow={t(`${kind}.eyebrow`)}
      title={t(`${kind}.title`)}
      lede={t(`${kind}.subtitle`)}
      mediaId={kind === 'skilled' ? 'landing.guild.household' : 'agri.hero'}
      tint={kind === 'skilled' ? 'household' : 'labour'}
      stamp={t(`${kind}.eyebrow`)}
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

        {kind === 'skilled' && (
          <fieldset className="flex flex-col gap-2">
            <legend className="font-mono text-[10px] uppercase tracking-widest text-fy-muted font-semibold mb-1.5">
              {t('skilled.tradesLegend')}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {TRADE_SKILLS.map((s) => {
                const on = trades.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(s)}
                    className={`min-h-[48px] rounded-cell border px-3 flex items-center gap-2 text-left transition-colors ${
                      on ? 'border-fy-brown bg-fy-brown/8' : 'border-fy-brown/15 bg-fy-well hover:border-fy-brown/40'
                    }`}
                  >
                    <Icon name={TRADE_GLYPH[s]} size={18} className={on ? 'text-fy-brown' : 'text-fy-muted'} />
                    <span className="flex-1 min-w-0 py-1.5 font-body text-label font-semibold text-fy-ink leading-tight">
                      {tk(`trades.${s}`)}
                    </span>
                    {on && <Icon name="check_circle" size={16} className="text-fy-brown shrink-0" />}
                  </button>
                );
              })}
            </div>
            <p className="font-body text-label text-fy-ink-soft">{t('skilled.tradesHint')}</p>
          </fieldset>
        )}

        {kind === 'agri' && (
          <div className="rounded-cell bg-fy-lime-tint-1 border border-fy-green/15 px-4 py-3 flex items-start gap-3">
            <Icon name="agriculture" size={20} className="text-fy-green shrink-0 mt-0.5" />
            <p className="font-body text-label text-fy-ink-soft">{t('agri.workHint')}</p>
          </div>
        )}

        <SignupField label={t('name')}>
          <input
            required
            autoComplete="name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={t('name')}
            className={signupInputClass}
          />
        </SignupField>

        <SignupField label={t('phone')}>
          <input
            required
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder={t('phone')}
            className={signupInputClass}
          />
        </SignupField>

        <SignupField label={t('password')}>
          <input
            required
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder={t('password')}
            className={signupInputClass}
          />
        </SignupField>

        <Button type="submit" className="w-full mt-1" disabled={loading}>
          {loading ? t('submitting') : t('submit')}
        </Button>
      </form>
    </SignupShell>
  );
}
