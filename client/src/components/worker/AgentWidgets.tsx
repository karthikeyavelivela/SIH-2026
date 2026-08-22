'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { AgentResultCard, type AgentResult } from '@/components/ui/AgentResultCard';
import { SparkleIcon } from '@/components/ui/icons';

/**
 * Phase 4 client surface 1 — the support-agent ask box (Agent A). Any
 * authenticated role can ask about their OWN records (bookings, complaints,
 * insurance, KYC status) — the server derives scope from the session, this
 * component never sends a userId. Collapsed by default so it doesn't
 * compete with the primary dashboard content; expands into a plain
 * question box + AgentResultCard on submit.
 */
export function SupportAgentWidget({ accent = 'primary' }: { accent?: 'primary' | 'secondary' }) {
  const t = useTranslations('agents.support');
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AgentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ result: AgentResult }>('/api/agents/support', { question: question.trim() });
      setResult(res.result);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('error'));
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 p-4 rounded-ip-card bg-ip-surface-container hover:bg-ip-surface-container-high transition-colors duration-base w-full text-left mb-3"
      >
        <span className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${accent === 'primary' ? 'bg-primary/10 text-primary-600' : 'bg-secondary/10 text-secondary-600'}`}>
          <SparkleIcon className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t('collapsedTitle')}</p>
          <p className="text-xs text-ip-on-surface-variant">{t('collapsedHint')}</p>
        </div>
      </button>
    );
  }

  return (
    <div className="ip-card mb-3">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold">{t('askTitle')}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ip-on-surface-variant">
          {t('close')}
        </button>
      </div>
      <div className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask()}
          placeholder={t('placeholder')}
          className="flex-1 min-h-[44px] px-3.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm focus:border-ip-primary focus:ring-2 focus:ring-ip-primary/20"
        />
        <button
          type="button"
          disabled={loading || !question.trim()}
          onClick={ask}
          className="px-4 rounded-ip-input bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {loading ? '…' : t('ask')}
        </button>
      </div>
      {error && <p className="text-sm text-ip-error mt-2">{error}</p>}
      {result && (
        <div className="mt-3">
          <AgentResultCard result={result} accent={accent} />
        </div>
      )}
    </div>
  );
}

/**
 * Phase 4 client surface 3 — the demand-forecast widget (Agent C). Region
 * comes from the caller's own profile (user.region) — the audience framing
 * (worker earnings hint vs. mutha_leader workforce-allocation vs. admin
 * surge framing) is decided server-side from the caller's role, never sent
 * from here.
 */
export function DemandForecastWidget({ region, accent = 'primary' }: { region: string | undefined; accent?: 'primary' | 'secondary' }) {
  const t = useTranslations('agents.demandForecast');
  const [result, setResult] = useState<AgentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!region) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ result: AgentResult }>('/api/agents/demand-forecast', { region });
      setResult(res.result);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('error'));
    } finally {
      setLoading(false);
    }
  }

  if (!region) return null;

  return (
    <div className="mb-3">
      {result ? (
        <AgentResultCard result={result} accent={accent} />
      ) : (
        <button
          type="button"
          disabled={loading}
          onClick={run}
          className="flex items-center gap-3 p-4 rounded-ip-card bg-ip-surface-container hover:bg-ip-surface-container-high transition-colors duration-base w-full text-left disabled:opacity-50"
        >
          <span className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${accent === 'primary' ? 'bg-primary/10 text-primary-600' : 'bg-secondary/10 text-secondary-600'}`}>
            <SparkleIcon className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{loading ? t('loading') : t('titleFor', { region })}</p>
            <p className="text-xs text-ip-on-surface-variant">{t('subtitle')}</p>
          </div>
        </button>
      )}
      {error && <p className="text-sm text-ip-error mt-2">{error}</p>}
    </div>
  );
}

export type FareCategory = 'vehicle_small' | 'vehicle_medium' | 'vehicle_large' | 'hamali';

/**
 * Phase 6.1 — Agent E, the pricing & quote sanity-check widget. Sits next
 * to a real quote (customer/book/page.tsx's FareCard, already computed by
 * the authoritative /api/bookings/quote) — this never replaces or
 * recomputes that number, it only asks the pricing-quote agent whether the
 * active rule + recent comparable bookings back it up. Collapsed behind an
 * opt-in button like SupportAgentWidget, so it never blocks or slows the
 * booking flow for anyone who doesn't ask.
 */
export function PricingQuoteWidget({
  region,
  category,
  distanceKm,
  hamaliCount,
  accent = 'primary',
}: {
  region: string;
  category: FareCategory;
  distanceKm: number;
  hamaliCount?: number;
  accent?: 'primary' | 'secondary';
}) {
  const t = useTranslations('agents.pricingQuote');
  const [result, setResult] = useState<AgentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ result: AgentResult }>('/api/agents/pricing-quote', {
        region,
        category,
        distanceKm,
        hamaliCount,
      });
      setResult(res.result);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3">
      {result ? (
        <AgentResultCard result={result} accent={accent} />
      ) : (
        <button
          type="button"
          disabled={loading}
          onClick={run}
          className="flex items-center gap-3 p-3.5 rounded-ip-card bg-ip-surface-container hover:bg-ip-surface-container-high transition-colors duration-base w-full text-left disabled:opacity-50"
        >
          <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${accent === 'primary' ? 'bg-primary/10 text-primary-600' : 'bg-secondary/10 text-secondary-600'}`}>
            <SparkleIcon className="w-4.5 h-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{loading ? t('loading') : t('title')}</p>
            <p className="text-xs text-ip-on-surface-variant">{t('subtitle')}</p>
          </div>
        </button>
      )}
      {error && <p className="text-sm text-ip-error mt-2">{error}</p>}
    </div>
  );
}

/**
 * Phase 6.1 — Agent F, the market-insights widget. Admin/manager only
 * (server enforces this, this component is only ever mounted in
 * admin-console surfaces). `region` optional — omitted means platform-wide.
 */
export function MarketInsightsWidget({ region, accent = 'primary' }: { region?: string; accent?: 'primary' | 'secondary' }) {
  const t = useTranslations('agents.marketInsights');
  const [result, setResult] = useState<AgentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ result: AgentResult }>('/api/agents/market-insights', region ? { region } : {});
      setResult(res.result);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-3">
      {result ? (
        <AgentResultCard result={result} accent={accent} />
      ) : (
        <button
          type="button"
          disabled={loading}
          onClick={run}
          className="flex items-center gap-3 p-4 rounded-ip-card bg-ip-surface-container hover:bg-ip-surface-container-high transition-colors duration-base w-full text-left disabled:opacity-50"
        >
          <span className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${accent === 'primary' ? 'bg-primary/10 text-primary-600' : 'bg-secondary/10 text-secondary-600'}`}>
            <SparkleIcon className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{loading ? t('loading') : t('title')}</p>
            <p className="text-xs text-ip-on-surface-variant">{t('subtitle')}</p>
          </div>
        </button>
      )}
      {error && <p className="text-sm text-ip-error mt-2">{error}</p>}
    </div>
  );
}
