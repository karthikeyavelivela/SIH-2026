'use client';

import { useState } from 'react';
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
      setError(err instanceof ApiClientError ? err.message : 'Could not get an answer — try again.');
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
          <p className="text-sm font-semibold">Ask about your bookings, payouts, or KYC</p>
          <p className="text-xs text-ip-on-surface-variant">AI assistant, answers from your own account data</p>
        </div>
      </button>
    );
  }

  return (
    <div className="ip-card mb-3">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold">Ask a question</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ip-on-surface-variant">
          Close
        </button>
      </div>
      <div className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask()}
          placeholder="e.g. Why is my last payout still pending?"
          className="flex-1 min-h-[44px] px-3.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm focus:border-ip-primary focus:ring-2 focus:ring-ip-primary/20"
        />
        <button
          type="button"
          disabled={loading || !question.trim()}
          onClick={ask}
          className="px-4 rounded-ip-input bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {loading ? '…' : 'Ask'}
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
      setError(err instanceof ApiClientError ? err.message : 'Could not forecast demand — try again.');
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
            <p className="text-sm font-semibold">{loading ? 'Forecasting…' : `Demand forecast for ${region}`}</p>
            <p className="text-xs text-ip-on-surface-variant">Based on real recent booking history</p>
          </div>
        </button>
      )}
      {error && <p className="text-sm text-ip-error mt-2">{error}</p>}
    </div>
  );
}
