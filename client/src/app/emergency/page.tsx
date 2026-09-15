'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { SOSButton } from '@/components/ui/SOSButton';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { Field } from '@/components/fy/Controls';
import { TopBar } from '@/components/fy/Navigation';

/**
 * The SOS screen — feature 8's missing half.
 *
 * SOSButton.tsx has existed in this repo, fully written, press-and-hold and
 * all, with zero callers and no endpoint behind it. A panic button wired to
 * nothing is worse than no panic button, because someone might rely on it.
 * This is what it now presses.
 *
 * Two deliberate choices:
 *
 *  - Location is requested but never required. It is fetched in the
 *    background while the person chooses what is happening, and the SOS
 *    sends with whatever is available when they hold the button. A denied
 *    permission cannot be the reason a call for help does not go out.
 *  - The real emergency number is on the screen, above everything. FYRO's
 *    operations desk is not an ambulance, and pretending otherwise would be
 *    the most dangerous thing this app could do.
 */

type Kind = 'accident' | 'unsafe' | 'medical' | 'vehicle' | 'other';
const KINDS: Kind[] = ['accident', 'unsafe', 'medical', 'vehicle', 'other'];

interface Alert {
  _id: string;
  kind: Kind;
  status: 'open' | 'acknowledged' | 'resolved';
  createdAt: string;
  note?: string;
}

export default function EmergencyPage() {
  const t = useTranslations('sos');
  const router = useRouter();
  const [kind, setKind] = useState<Kind>('other');
  const [note, setNote] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(true);
  const [sent, setSent] = useState<{ alreadyOpen: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<Alert[]>([]);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    api
      .get<{ alerts: Alert[] }>('/api/emergency/mine')
      .then((res) => setMine(res.alerts))
      .catch(() => {});
  }, [sent]);

  async function trigger() {
    setError(null);
    try {
      const res = await api.post<{ alert: Alert; alreadyOpen?: boolean }>('/api/emergency', {
        kind,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      });
      setSent({ alreadyOpen: !!res.alreadyOpen });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('error'));
    }
  }

  return (
    <div className="min-h-screen bg-fy-bone fy-pad-nav">
      <TopBar title={t('title')} showBack onBack={() => router.back()} />

      <main className="pt-16 px-gutter max-w-2xl mx-auto flex flex-col gap-5">
        {/* Above everything, in every state: FYRO is not the emergency
            services, and the app must say so before it offers its own. */}
        <LightCard className="flex items-start gap-2.5 border-l-[3px] border-l-fy-brown">
          <Icon name="emergency" size={18} className="text-fy-brown shrink-0 mt-px" />
          <Body size="label">{t('emergencyNumber')}</Body>
        </LightCard>

        {sent ? (
          <Panel className="flex items-start gap-3">
            <Icon name="check_circle" size={20} className="text-fy-green shrink-0 mt-px" />
            <Body>{sent.alreadyOpen ? t('alreadyOpen') : t('sent')}</Body>
          </Panel>
        ) : (
          <>
            <Section title={<SectionHeading>{t('kind')}</SectionHeading>}>
              <div className="grid grid-cols-2 gap-2">
                {KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`min-h-[44px] px-3 rounded-control border text-left font-body text-label transition-colors ${
                      kind === k ? 'border-fy-brown bg-fy-brown/8 text-fy-ink' : 'border-fy-brown/15 text-fy-muted'
                    }`}
                  >
                    {t(`kinds.${k}` as never)}
                  </button>
                ))}
              </div>
            </Section>

            <Section title={<SectionHeading>{t('noteLabel')}</SectionHeading>}>
              <Field value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} />
            </Section>

            <div className="flex flex-col items-center gap-3 py-2">
              <SOSButton onTrigger={trigger} />
              <Body size="label">{t('hold')}</Body>
              <p className="font-body text-eyebrow text-fy-muted text-center max-w-sm">{t('holdHint')}</p>
              <span className="font-mono text-[10px] text-fy-muted">
                {locating ? t('locating') : coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : t('noLocation')}
              </span>
            </div>
          </>
        )}

        {error && (
          <LightCard>
            <Body size="label">{error}</Body>
          </LightCard>
        )}

        {mine.length > 0 && (
          <Section title={<SectionHeading>{t('myAlerts')}</SectionHeading>}>
            <div className="flex flex-col gap-2">
              {mine.map((a) => (
                <LightCard key={a._id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <Body size="label">{t(`kinds.${a.kind}` as never)}</Body>
                    <span className="font-mono text-[10px] text-fy-muted">
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </span>
                  <StatusPill tone={a.status === 'resolved' ? 'lime' : a.status === 'acknowledged' ? 'neutral' : 'critical'}>
                    {t(`status.${a.status}` as never)}
                  </StatusPill>
                </LightCard>
              ))}
            </div>
          </Section>
        )}
      </main>
    </div>
  );
}
