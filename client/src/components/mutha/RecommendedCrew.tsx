'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { LightCard } from '@/components/fy/Surfaces';
import { Body, EyebrowLabel } from '@/components/fy/Text';
import { Button } from '@/components/fy/Controls';

interface RecommendedMember {
  memberId: string;
  name: string;
  reasons: string[];
  distanceKm: number | null;
}

interface Recommendation {
  source: 'ml' | 'rules';
  needed: number;
  unmet: number;
  assigned: RecommendedMember[];
  alternates: RecommendedMember[];
}

const KNOWN_REASONS = ['skill_match', 'available', 'near', 'fewer_recent_days'] as const;

/**
 * P2.2 — "Suggested crew" for a job, with the reasons for each name. A
 * suggestion only: "Use these" fills the picker, and the leader can still
 * swap or remove anyone before assigning. Whatever they finally choose is
 * logged against the suggestion on the server.
 */
export function RecommendedCrew({ bookingId, onUse }: { bookingId: string; onUse: (memberIds: string[]) => void }) {
  const t = useTranslations('crewRecommend');
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function suggest() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ recommendation: Recommendation }>('/api/mutha/allocation/recommend', { bookingId });
      setRec(res.recommendation);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  const reasons = (m: RecommendedMember) =>
    m.reasons
      .filter((r): r is (typeof KNOWN_REASONS)[number] => (KNOWN_REASONS as readonly string[]).includes(r))
      .map((r) => t(`reason_${r}`))
      .join(' · ');

  return (
    <div className="flex flex-col gap-2">
      <Button size="md" variant="ghost" disabled={busy} onClick={suggest}>
        {busy ? t('loading') : t('button')}
      </Button>
      {error && <Body size="label">{error}</Body>}
      {rec && (
        <LightCard className="flex flex-col gap-2">
          <EyebrowLabel>{t('title')}</EyebrowLabel>
          <Body size="label">{rec.source === 'ml' ? t('sourceMl') : t('sourceRules')}</Body>
          {rec.assigned.length === 0 ? (
            <Body size="label">{t('none')}</Body>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {rec.assigned.map((m) => (
                <li key={m.memberId} className="text-sm text-fy-ink">
                  <span className="font-semibold">{m.name}</span>
                  {m.distanceKm != null && <span className="text-fy-ink-soft"> · {t('away', { km: m.distanceKm })}</span>}
                  <br />
                  <span className="text-xs text-fy-ink-soft">{reasons(m)}</span>
                </li>
              ))}
            </ul>
          )}
          {rec.unmet > 0 && <Body size="label">{t('unmet', { count: rec.unmet })}</Body>}
          {rec.assigned.length > 0 && (
            <Button size="md" onClick={() => onUse(rec.assigned.map((m) => m.memberId))}>
              {t('useThese')}
            </Button>
          )}
          {rec.alternates.length > 0 && (
            <div>
              <EyebrowLabel>{t('alternates')}</EyebrowLabel>
              <p className="text-xs text-fy-ink-soft">{rec.alternates.map((m) => m.name).join(', ')}</p>
            </div>
          )}
        </LightCard>
      )}
    </div>
  );
}
