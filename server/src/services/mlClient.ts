import { env } from '../config/env';

/**
 * Client for the fyro-ml service (ml/). Every call has a 3 s timeout and
 * never throws: a missing URL, a slow service or an error all come back as
 * `{ ok: false, reason }`, and the caller falls back to its rules and labels
 * the answer source 'rules'. A result from here is labelled 'ml'.
 */
export const ML_TIMEOUT_MS = 3000;

export type MlResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export interface MlForecastRow {
  date: string;
  category: string;
  prediction: number;
  lower: number;
  upper: number;
  method: 'xgboost' | 'seasonal_naive';
  model_version: string | null;
  trained_on_n: number;
  cold_start: boolean;
}

export interface MlAllocation {
  status: string;
  spread_days: number | null;
  slots: {
    slot_id: string;
    date: string;
    needed: number;
    unmet: number;
    assigned: { member_id: string; reasons: string[]; distance_km: number | null }[];
    alternates: { member_id: string; reasons: string[] }[];
  }[];
}

export type MlAnomaly =
  | { available: false; reason: string; needed?: number; have?: number }
  | { available: true; score: number; flagged: boolean; source: string; model_version: string | null; fitted_on_n: number | null };

export function mlConfigured(): boolean {
  return Boolean(env.ML_SERVICE_URL && env.ML_SERVICE_TOKEN);
}

async function call<T>(path: string, body: unknown): Promise<MlResult<T>> {
  if (!mlConfigured()) return { ok: false, reason: 'not_configured' };
  try {
    const res = await fetch(`${env.ML_SERVICE_URL!.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.ML_SERVICE_TOKEN}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ML_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    const name = (err as Error)?.name;
    return { ok: false, reason: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unreachable' };
  }
}

export async function mlForecast(input: {
  category: string;
  history: { date: string; count: number }[];
  start: string;
  horizonDays?: number;
  societySize?: number;
}): Promise<MlResult<{ category: string; forecast: MlForecastRow[] }>> {
  return call('/forecast', {
    category: input.category,
    history: input.history,
    start: input.start,
    horizon_days: input.horizonDays ?? 7,
    society_size: input.societySize ?? 0,
  });
}

export async function mlAllocate(input: {
  slots: { id: string; date: string; needed: number; skills?: string[]; location?: { lat: number; lng: number } }[];
  members: { id: string; skills?: string[]; unavailable_dates?: string[]; location?: { lat: number; lng: number }; recent_days?: number }[];
  maxAlternates?: number;
}): Promise<MlResult<MlAllocation>> {
  return call('/allocate', { slots: input.slots, members: input.members, max_alternates: input.maxAlternates ?? 3 });
}

export async function mlPriceAnomaly(input: { category: string; rate: number; history: number[] }): Promise<MlResult<MlAnomaly>> {
  return call('/price-anomaly', input);
}

/** For /api/health: is the service configured, and does it answer? */
export async function mlHealth(): Promise<{ configured: boolean; reachable?: boolean; modelVersion?: string | null; insufficientData?: boolean | null; reason?: string }> {
  if (!env.ML_SERVICE_URL) return { configured: false };
  try {
    const res = await fetch(`${env.ML_SERVICE_URL.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(ML_TIMEOUT_MS) });
    if (!res.ok) return { configured: true, reachable: false, reason: `http_${res.status}` };
    const j = (await res.json()) as { model_version?: string | null; insufficient_data?: boolean | null };
    return { configured: true, reachable: true, modelVersion: j.model_version ?? null, insufficientData: j.insufficient_data ?? null };
  } catch {
    return { configured: true, reachable: false, reason: 'unreachable' };
  }
}
