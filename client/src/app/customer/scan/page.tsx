'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { TopBar } from '@/components/fy/Navigation';
import { LightCard, Panel, Section } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { Button, Field } from '@/components/fy/Controls';
import { StatusPill } from '@/components/fy/Status';
import { useCategoryName } from '@/lib/categoryName';

/**
 * Scan and Diagnose.
 *
 * Photograph the problem, get told what it is and who fixes it. It is
 * TARA's existing symptom-to-trade routing with an image as the input, so
 * everything TARA already promises holds here: a confidence level is always
 * shown, the evidence is always listed, and nothing is booked without the
 * customer pressing the button themselves.
 *
 * Three outcomes, and the screen is honest about which one it is in:
 *
 *   - a safe step to try first, with the booking fallback right beneath it,
 *     because "try this" that leaves you stranded is worse than no advice;
 *   - a trade, with the photo and note carried into that trade's booking
 *     flow so the worker sees what the customer saw;
 *   - neither, said plainly, with the category list offered rather than a
 *     guess. A confidently wrong trade sends a real person to someone's home
 *     and bills them for it.
 */

const CATEGORY_GLYPH: Record<string, string> = {
  electrician: 'bolt',
  plumber: 'plumbing',
  carpenter: 'carpenter',
  painter: 'format_paint',
  domestic_helper: 'home_work',
  caregiver: 'volunteer_activism',
  gardener: 'potted_plant',
  cleaner: 'cleaning_services',
  technician: 'build',
  driver: 'local_taxi',
  general_logistics: 'local_shipping',
  general_labour: 'engineering',
};

interface Diagnosis {
  summary: string;
  confidence: 'low' | 'moderate' | 'high';
  evidence: { label: string; value: string }[];
  mock: boolean;
  selfFix?: string;
  safetyNote?: string;
  inconclusive: boolean;
  suggestion?: {
    categorySlug: string;
    path: string;
    reason: string;
    pricing?: { sampleSize: number; mode: string; low?: number; high?: number };
  };
}

/** 6 MB of file, matching the server's own cap so the rejection happens before the upload. */
const MAX_BYTES = 6 * 1024 * 1024;

export default function ScanAndDiagnosePage() {
  const t = useTranslations('scan');
  const tConf = useTranslations('agents');
  const categoryName = useCategoryName();
  const router = useRouter();

  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [payload, setPayload] = useState<{ base64: string; mediaType: string } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setDiagnosis(null);

    if (file.size > MAX_BYTES) {
      setError(t('tooLarge'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      // data:image/jpeg;base64,XXXX — the server wants the two halves apart.
      const comma = result.indexOf(',');
      if (comma < 0) {
        setError(t('couldNotRead'));
        return;
      }
      setPreview(result);
      setPayload({ base64: result.slice(comma + 1), mediaType: file.type || 'image/jpeg' });
    };
    reader.onerror = () => setError(t('couldNotRead'));
    reader.readAsDataURL(file);
  }

  async function analyse() {
    if (!payload) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ diagnosis: Diagnosis; photoUrl?: string }>('/api/assistant/diagnose-photo', {
        imageBase64: payload.base64,
        mediaType: payload.mediaType,
        note: note.trim() || undefined,
      });
      setDiagnosis(res.diagnosis);
      setPhotoUrl(res.photoUrl ?? null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Into the trade's own booking screen, carrying the evidence.
   *
   * The photo URL and the summary ride in the query string because that is
   * what survives a full page navigation into a route this screen does not
   * own. The booking screen reads them, shows them back, and posts them
   * onto the booking record.
   */
  function bookTrade(slug: string, path: string) {
    const params = new URLSearchParams();
    if (photoUrl) params.set('photo', photoUrl);
    if (diagnosis?.summary) params.set('diagnosis', diagnosis.summary.slice(0, 400));
    if (note.trim()) params.set('note', note.trim().slice(0, 300));
    const qs = params.toString();
    router.push(qs ? `${path}?${qs}` : path);
    void slug;
  }

  function reset() {
    setPreview(null);
    setPayload(null);
    setDiagnosis(null);
    setPhotoUrl(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />
      <TopBar title={t('title')} showBack />

      <main className="pt-16 fy-pad-nav px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        {!diagnosis && (
          <>
            <Body>{t('intro')}</Body>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              // `capture` opens the camera straight away on a phone and is
              // simply ignored on a desktop, where the file picker is the
              // right control anyway.
              capture="environment"
              onChange={onPick}
              className="sr-only"
              id="scan-file"
            />

            {preview ? (
              <div className="relative w-full rounded-card overflow-hidden bg-fy-panel">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt={t('previewAlt')} className="w-full max-h-[46vh] object-contain" />
                <button
                  type="button"
                  onClick={reset}
                  aria-label={t('retake')}
                  className="absolute top-2 right-2 w-9 h-9 rounded-full bg-fy-ink/50 text-fy-bone flex items-center justify-center backdrop-blur-sm"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
            ) : (
              <label
                htmlFor="scan-file"
                className="flex flex-col items-center justify-center gap-2 w-full h-[42vh] rounded-card border-2 border-dashed border-fy-brown/25 bg-fy-panel cursor-pointer transition-colors hover:bg-fy-well"
              >
                <span className="w-14 h-14 rounded-full bg-fy-brown/10 text-fy-brown flex items-center justify-center">
                  <Icon name="photo_camera" size={26} />
                </span>
                <span className="font-body text-body font-semibold text-fy-ink">{t('takePhoto')}</span>
                <span className="font-body text-label text-fy-muted">{t('orChoose')}</span>
              </label>
            )}

            <label className="flex flex-col gap-1">
              <EyebrowLabel>{t('noteLabel')}</EyebrowLabel>
              <Field
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('notePlaceholder')}
                maxLength={300}
              />
            </label>

            {error && (
              <div role="alert" className="rounded-control bg-fy-error-bg px-4 py-3 font-body text-label text-fy-on-error-bg">
                {error}
              </div>
            )}

            <Button glyph="search_insights" disabled={!payload || busy} onClick={analyse} className="w-full">
              {busy ? t('analysing') : t('analyse')}
            </Button>

            <Body size="label" className="text-center">
              {t('privacyNote')}
            </Body>
          </>
        )}

        {diagnosis && (
          <>
            {preview && (
              <div className="w-full rounded-card overflow-hidden bg-fy-panel">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt={t('previewAlt')} className="w-full max-h-[28vh] object-contain" />
              </div>
            )}

            <Panel className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <EyebrowLabel tone="brown">{t('taraSays')}</EyebrowLabel>
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Same two badges every agent surface carries: how sure,
                      and whether a real model answered at all. */}
                  <StatusPill tone={diagnosis.confidence === 'high' ? 'lime' : 'neutral'}>
                    {tConf(`confidence.${diagnosis.confidence}` as never)}
                  </StatusPill>
                  {diagnosis.mock && <StatusPill tone="outline">{tConf('demoMode')}</StatusPill>}
                </div>
              </div>

              <Body>{diagnosis.summary}</Body>

              {diagnosis.evidence.length > 0 && (
                <div className="flex flex-col gap-1 pt-1 border-t border-fy-brown/10">
                  {diagnosis.evidence.map((e, i) => (
                    <span key={i} className="font-mono text-[10px] text-fy-muted">
                      {e.label}: {e.value}
                    </span>
                  ))}
                </div>
              )}
            </Panel>

            {/* A safe step to try first. The booking fallback sits directly
                under it, always — advice that leaves someone stranded is
                worse than no advice. */}
            {diagnosis.selfFix && (
              <LightCard className="flex flex-col gap-2 border-l-2 border-fy-green">
                <span className="flex items-center gap-1.5">
                  <Icon name="handyman" size={16} className="text-fy-green" />
                  <EyebrowLabel tone="green">{t('tryFirst')}</EyebrowLabel>
                </span>
                <Body>{diagnosis.selfFix}</Body>
              </LightCard>
            )}

            {/* Why no self-fix was offered, when one was withheld. Said out
                loud rather than silently omitted. */}
            {diagnosis.safetyNote && (
              <LightCard className="flex items-start gap-2 border-l-2 border-fy-brown">
                <Icon name="shield" size={16} className="text-fy-brown shrink-0 mt-0.5" />
                <Body size="label">{diagnosis.safetyNote}</Body>
              </LightCard>
            )}

            {diagnosis.suggestion && (
              <Section title={<SectionHeading>{t('whoFixesThis')}</SectionHeading>}>
                <LightCard className="flex items-center gap-3">
                  <span className="w-11 h-11 rounded-full bg-fy-brown/10 text-fy-brown flex items-center justify-center shrink-0">
                    <Icon name={CATEGORY_GLYPH[diagnosis.suggestion.categorySlug] ?? 'handyman'} size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-body text-body font-semibold text-fy-ink">
                      {categoryName({
                        slug: diagnosis.suggestion.categorySlug,
                        name: diagnosis.suggestion.categorySlug,
                      })}
                    </span>
                    {diagnosis.suggestion.reason && (
                      <span className="block font-body text-label text-fy-muted">{diagnosis.suggestion.reason}</span>
                    )}
                  </span>
                </LightCard>

                <Button
                  glyph="bolt"
                  className="w-full mt-2"
                  onClick={() => bookTrade(diagnosis.suggestion!.categorySlug, diagnosis.suggestion!.path)}
                >
                  {diagnosis.selfFix ? t('stillNeedHelp') : t('bookThisTrade')}
                </Button>

                {photoUrl && <Body size="label" className="mt-1.5">{t('photoTravels')}</Body>}
              </Section>
            )}

            {/* Neither a fix nor a trade. The category list, not a guess. */}
            {diagnosis.inconclusive && (
              <Section title={<SectionHeading>{t('pickYourself')}</SectionHeading>}>
                <Body size="label">{t('pickYourselfHint')}</Body>
                <Link href="/customer/dashboard">
                  <Button variant="light" glyph="grid_view" className="w-full mt-2">
                    {t('browseServices')}
                  </Button>
                </Link>
              </Section>
            )}

            <Button variant="ghost" glyph="photo_camera" onClick={reset} className="w-full">
              {t('scanAnother')}
            </Button>
          </>
        )}
      </main>
    </div>
  );
}
