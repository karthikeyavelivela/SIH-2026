'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { Button, Field } from '@/components/fy/Controls';
import { TopBar } from '@/components/fy/Navigation';

/**
 * The operations side of an SOS.
 *
 * Polled rather than pushed, at a shorter interval than anything else in the
 * app: this is the one queue where being a minute out of date matters. Every
 * action here is audit-logged server-side with who took it, because "who
 * picked this up and when" is the first question asked after an incident.
 */

interface Alert {
  _id: string;
  kind: string;
  status: 'open' | 'acknowledged' | 'resolved';
  note?: string;
  createdAt: string;
  location?: { coordinates: [number, number] };
  raisedByUserId?: { _id: string; name: string; phone: string; role: string };
}

export default function AdminEmergenciesPage() {
  const t = useTranslations('sos');
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data, reload } = usePolling(() => api.get<{ alerts: Alert[] }>('/api/emergency'), 15000);
  const alerts = data?.alerts ?? [];

  async function act(id: string, action: 'acknowledge' | 'resolve') {
    setBusy(id);
    setError(null);
    try {
      await api.patch(`/api/emergency/${id}/${action}`, action === 'resolve' ? { resolutionNote: notes[id] } : {});
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('error'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-fy-bone pb-24">
      <TopBar title={t('queueTitle')} showBack onBack={() => router.back()} />

      <main className="pt-16 px-gutter max-w-2xl mx-auto flex flex-col gap-4">
        {error && (
          <LightCard>
            <Body size="label">{error}</Body>
          </LightCard>
        )}

        {alerts.length === 0 && (
          <LightCard className="flex items-center gap-3">
            <Icon name="check_circle" size={20} className="text-fy-green" />
            <Body size="label">{t('queueEmpty')}</Body>
          </LightCard>
        )}

        <Section title={<SectionHeading>{t('queueTitle')}</SectionHeading>}>
          <div className="flex flex-col gap-3">
            {alerts.map((a) => (
              <Panel key={a._id} className="flex flex-col gap-3 border-l-[3px] border-l-fy-brown">
                <div className="flex items-center justify-between gap-3">
                  <EyebrowLabel tone="brown">{t(`kinds.${a.kind}` as never)}</EyebrowLabel>
                  <StatusPill tone={a.status === 'acknowledged' ? 'neutral' : 'critical'}>
                    {t(`status.${a.status}` as never)}
                  </StatusPill>
                </div>

                <div className="flex flex-col gap-1">
                  <Body size="label">
                    {t('raisedBy')}: {a.raisedByUserId?.name ?? '—'} · {a.raisedByUserId?.phone ?? '—'} ·{' '}
                    {a.raisedByUserId?.role ?? '—'}
                  </Body>
                  <span className="font-mono text-[10px] text-fy-muted">{new Date(a.createdAt).toLocaleString()}</span>
                  {a.note && <Body size="label">{a.note}</Body>}
                </div>

                {a.location ? (
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${a.location.coordinates[1]}&mlon=${a.location.coordinates[0]}#map=17/${a.location.coordinates[1]}/${a.location.coordinates[0]}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-body text-label font-semibold text-fy-brown hover:underline"
                  >
                    {t('openMap')}
                  </a>
                ) : (
                  <span className="font-mono text-[10px] text-fy-muted">{t('noLocationShort')}</span>
                )}

                <div className="flex flex-col gap-2">
                  {a.status === 'open' && (
                    <Button size="md" glyph="how_to_reg" disabled={busy === a._id} onClick={() => act(a._id, 'acknowledge')}>
                      {t('acknowledge')}
                    </Button>
                  )}
                  <Field
                    value={notes[a._id] ?? ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [a._id]: e.target.value }))}
                    placeholder={t('resolutionPlaceholder')}
                  />
                  <Button
                    variant="ghost"
                    size="md"
                    glyph="check"
                    disabled={busy === a._id}
                    onClick={() => act(a._id, 'resolve')}
                  >
                    {t('resolve')}
                  </Button>
                </div>
              </Panel>
            ))}
          </div>
        </Section>
      </main>
    </div>
  );
}
