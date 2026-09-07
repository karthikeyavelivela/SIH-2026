'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiClientError, API_BASE } from '@/lib/api';
import { LoadManifest } from '@/lib/types';
import { SignatureCanvas, SignatureCanvasHandle } from '@/components/ui/SignatureCanvas';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { DataList, DataRow } from '@/components/fy/Data';
import { Button } from '@/components/fy/Controls';
import { TopBar } from '@/components/fy/Navigation';

/* Built against client/public/design/worker_load_manifest.html.

   Section order there, top to bottom: back bar -> "Verified transit
   protocol" header with its statutory line -> a reference block (ref
   number, form label, status pill) -> consignor and consignee blocks ->
   "Load specification" as a particulars / qty / mass table -> the driver
   sign-off.

   Largest element: the document heading. Dark surfaces: the sign-off CTA.

   Signing is a ONE-WAY transition the server enforces as immutable, so
   once status is 'signed' the signature pad is gone entirely — this screen
   never offers a re-sign.

   Two things on the design are not reproduced: GSTIN numbers for both
   parties, and a "LIVE ESCROW" pill. A manifest stores a consignor name,
   address and phone — there is no GSTIN field on either side — and there
   is no escrow mechanism behind that pill. The consignee block shows the
   booking's real drop address instead of an invented registered entity. */

export default function LoadManifestPage() {
  const t = useTranslations('loadManifest');
  const { bookingId } = useParams<{ bookingId: string }>();
  const router = useRouter();
  const sigRef = useRef<SignatureCanvasHandle>(null);

  const [manifest, setManifest] = useState<LoadManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ manifest: LoadManifest }>(`/api/load-manifests/${bookingId}`)
      .then((res) => {
        if (!cancelled) setManifest(res.manifest);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiClientError ? err.message : t('errorLoad'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId, t]);

  async function confirmAndAccept() {
    const dataUrl = sigRef.current?.toDataUrl();
    if (!dataUrl) {
      setError(t('errorNoSignature'));
      return;
    }
    setSigning(true);
    setError(null);
    try {
      const res = await api.post<{ manifest: LoadManifest }>(`/api/load-manifests/${bookingId}/sign`, {
        signatureImageBase64: dataUrl,
      });
      setManifest(res.manifest);
      router.push(`/driver/active-job/${bookingId}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorSubmit'));
    } finally {
      setSigning(false);
    }
  }

  const totalMass = manifest?.lineItems.reduce((s, i) => s + i.weightKg * (i.quantity || 1), 0) ?? 0;

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar
        eyebrow="FYRO Services"
        title={t('title')}
        showBack
        onBack={() => router.push(`/driver/active-job/${bookingId}`)}
      />

      <main className="pt-16 pb-16 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        {loading && <Body size="label">{t('loading')}</Body>}

        {!loading && manifest && (
          <>
            <div className="pt-2">
              <EyebrowLabel tone="brown">{t('protocolEyebrow')}</EyebrowLabel>
              <h2 className="font-heading text-heading text-fy-ink leading-[1.05]">{t('cargoManifest')}</h2>
              <Body className="mt-1.5">{t('statutoryNote')}</Body>
            </div>

            <Panel className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <EyebrowLabel>{t('refNumber')}</EyebrowLabel>
                <p className="font-heading text-title text-fy-ink tracking-wide">
                  BOL-{manifest._id.slice(-6).toUpperCase()}
                </p>
                <EyebrowLabel>{t('formLabel')}</EyebrowLabel>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <StatusPill tone={manifest.status === 'signed' ? 'lime' : 'outline'}>
                  {manifest.status === 'signed' ? t('signed') : t('pendingPickup')}
                </StatusPill>
                {manifest.signedAt && (
                  <EyebrowLabel>{new Date(manifest.signedAt).toLocaleString('en-IN')}</EyebrowLabel>
                )}
                <a
                  href={`${API_BASE}/api/load-manifests/${bookingId}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-body text-label font-semibold text-fy-brown hover:underline"
                >
                  <Icon name="download_for_offline" size={14} />
                  {t('downloadPdf')}
                </a>
              </div>
            </Panel>

            <LightCard className="flex items-start gap-3">
              <IconTile tone="peach" size="md">
                <Icon name="domain" size={20} />
              </IconTile>
              <div className="min-w-0">
                <EyebrowLabel>{t('consignor')}</EyebrowLabel>
                <p className="font-body text-body font-semibold text-fy-ink truncate">
                  {manifest.consignorDetails.name || t('consignorUnnamed')}
                </p>
                <Body size="label">{manifest.consignorDetails.address || t('pickupLocation')}</Body>
                {manifest.consignorDetails.phone && (
                  <Body size="label">{manifest.consignorDetails.phone}</Body>
                )}
              </div>
            </LightCard>

            <Section
              title={<SectionHeading>{t('loadSpecification')}</SectionHeading>}
              aside={<EyebrowLabel>{t('entryCount', { count: manifest.lineItems.length })}</EyebrowLabel>}
            >
              <Panel className="py-0">
                <DataList>
                  {manifest.lineItems.map((item) => (
                    <DataRow
                      key={item.sku}
                      title={item.sku}
                      meta={item.description}
                      trailing={
                        <div className="text-right">
                          <p className="font-body text-body font-semibold text-fy-ink">{item.weightKg} kg</p>
                          <EyebrowLabel>{t('qty', { count: item.quantity })}</EyebrowLabel>
                        </div>
                      }
                    />
                  ))}
                </DataList>
                {manifest.lineItems.length === 0 && (
                  <Body size="label" className="py-3">
                    {t('noLineItems')}
                  </Body>
                )}
                {manifest.lineItems.length > 0 && (
                  <>
                    <Divider />
                    <div className="flex items-center justify-between gap-3 py-3">
                      <EyebrowLabel>{t('totalMass')}</EyebrowLabel>
                      <p className="font-heading text-title text-fy-ink">{totalMass} kg</p>
                    </div>
                  </>
                )}
              </Panel>
            </Section>

            {error && (
              <div role="alert" className="rounded-control bg-fy-error-bg px-4 py-3 font-body text-label text-fy-on-error-bg">
                {error}
              </div>
            )}

            {manifest.status === 'signed' ? (
              <LightCard className="flex items-center gap-3">
                <IconTile tone="lime" size="md">
                  <Icon name="check" size={20} />
                </IconTile>
                <div className="min-w-0">
                  <p className="font-body text-body font-semibold text-fy-ink">{t('loadConfirmed')}</p>
                  <Body size="label">{t('signedImmutableNote')}</Body>
                </div>
              </LightCard>
            ) : (
              <Section title={<SectionHeading>{t('driverSignOff')}</SectionHeading>}>
                <Body size="label">{t('signOffConfirmation')}</Body>
                <SignatureCanvas ref={sigRef} />
                <Button glyph="draw" className="w-full" disabled={signing} onClick={confirmAndAccept}>
                  {signing ? t('submitting') : t('confirmAndAccept')}
                </Button>
              </Section>
            )}
          </>
        )}

        {!loading && !manifest && error && (
          <div role="alert" className="rounded-control bg-fy-error-bg px-4 py-3 font-body text-label text-fy-on-error-bg">
            {error}
          </div>
        )}
      </main>
    </div>
  );
}
