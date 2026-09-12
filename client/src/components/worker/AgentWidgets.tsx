'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { AgentResultCard, type AgentResult } from '@/components/ui/AgentResultCard';
import { SparkleIcon } from '@/components/ui/icons';

/**
 * The remaining per-screen agent widgets.
 *
 * The support ask-box that used to live here is gone: it was one of five
 * copies of the same feature, and TARA (components/ui/TaraEntry.tsx ->
 * /assistant) replaced all of them with a single assistant that keeps a
 * transcript and can fetch a human. What is left here are the agents that
 * are genuinely about the screen they sit on — a demand forecast for a
 * region, a pricing second opinion for a quote — and neither is a
 * conversation.
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
          className="flex items-center gap-3 p-4 rounded-card bg-fy-field hover:bg-fy-well transition-colors duration-base w-full text-left disabled:opacity-50"
        >
          <span className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${accent === 'primary' ? 'bg-fy-brown/10 text-fy-brown' : 'bg-fy-green/10 text-fy-green'}`}>
            <SparkleIcon className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{loading ? t('loading') : t('titleFor', { region })}</p>
            <p className="text-xs text-fy-ink-soft">{t('subtitle')}</p>
          </div>
        </button>
      )}
      {error && <p className="text-sm text-fy-error mt-2">{error}</p>}
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
          className="flex items-center gap-3 p-3.5 rounded-card bg-fy-field hover:bg-fy-well transition-colors duration-base w-full text-left disabled:opacity-50"
        >
          <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${accent === 'primary' ? 'bg-fy-brown/10 text-fy-brown' : 'bg-fy-green/10 text-fy-green'}`}>
            <SparkleIcon className="w-4.5 h-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{loading ? t('loading') : t('title')}</p>
            <p className="text-xs text-fy-ink-soft">{t('subtitle')}</p>
          </div>
        </button>
      )}
      {error && <p className="text-sm text-fy-error mt-2">{error}</p>}
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
          className="flex items-center gap-3 p-4 rounded-card bg-fy-field hover:bg-fy-well transition-colors duration-base w-full text-left disabled:opacity-50"
        >
          <span className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${accent === 'primary' ? 'bg-fy-brown/10 text-fy-brown' : 'bg-fy-green/10 text-fy-green'}`}>
            <SparkleIcon className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{loading ? t('loading') : t('title')}</p>
            <p className="text-xs text-fy-ink-soft">{t('subtitle')}</p>
          </div>
        </button>
      )}
      {error && <p className="text-sm text-fy-error mt-2">{error}</p>}
    </div>
  );
}
