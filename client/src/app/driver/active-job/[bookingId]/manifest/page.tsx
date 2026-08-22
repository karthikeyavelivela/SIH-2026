'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiClientError, API_BASE } from '@/lib/api';
import { LoadManifest } from '@/lib/types';
import { TopBar } from '@/components/ui/TopBar';
import { DataRow } from '@/components/ui/DataRow';
import { ListDivider } from '@/components/ui/ListDivider';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { SignatureCanvas, SignatureCanvasHandle } from '@/components/ui/SignatureCanvas';
import { AlertIcon, CheckIcon } from '@/components/ui/icons';

// Bill-of-Lading sign-off for the assigned driver, reached from the active
// job screen once pickup is confirmed. GET create-on-first-reads the
// manifest (line items derived from the booking's cargo details server
// side); POSTing a signature is a ONE-WAY transition the server enforces
// as immutable — this page mirrors that by hiding the signature pad
// entirely once status is 'signed', it never lets you "re-sign".
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
  }, [bookingId]);

  async function confirmAndAccept() {
    const dataUrl = sigRef.current?.toDataUrl();
    if (!dataUrl) {
      setError(t('errorSignFirst'));
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

  return (
    <div className="min-h-screen bg-ip-surface pb-10">
      <TopBar title={t('title')} onBack={() => router.push(`/driver/active-job/${bookingId}`)} />

      <div className="max-w-lg mx-auto px-ip-edge pt-ip-md">
        {loading && <p className="text-sm text-ip-on-surface-variant">{t('loading')}</p>}

        {!loading && manifest && (
          <>
            <div className="flex items-center gap-2 mb-ip-md">
              <StatusChip tone={manifest.status === 'signed' ? 'success' : 'muted'} dot>
                {manifest.status === 'signed' ? t('signed') : t('pendingPickup')}
              </StatusChip>
              {manifest.signedAt && (
                <span className="text-xs text-ip-on-surface-variant">
                  {new Date(manifest.signedAt).toLocaleString('en-IN')}
                </span>
              )}
              <a
                href={`${API_BASE}/api/load-manifests/${bookingId}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs font-semibold text-ip-secondary hover:underline"
              >
                {t('downloadPdf')}
              </a>
            </div>

            <section className="mb-ip-lg">
              <h2 className="font-heading font-bold text-ip-headline-sm mb-1">{t('cargoManifest')}</h2>
              <p className="text-sm text-ip-on-surface-variant mb-ip-sm">
                {manifest.consignorDetails.address || t('pickupLocation')}
              </p>
              <div className="ip-card">
                {manifest.lineItems.map((item, i) => (
                  <div key={item.sku}>
                    {i > 0 && <ListDivider />}
                    <DataRow
                      label={item.sku}
                      hint={item.description}
                      value={
                        <div className="text-right">
                          <p>{item.weightKg} kg</p>
                          <p className="text-xs font-normal text-ip-on-surface-variant">{t('qty', { count: item.quantity })}</p>
                        </div>
                      }
                    />
                  </div>
                ))}
                {manifest.lineItems.length === 0 && (
                  <p className="text-sm text-ip-on-surface-variant py-3">{t('noLineItems')}</p>
                )}
              </div>
            </section>

            {error && (
              <div role="alert" className="flex items-start gap-2 mb-ip-md rounded-ip-card bg-ip-error-container px-4 py-3 text-sm text-ip-on-error-container">
                <AlertIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {manifest.status === 'signed' ? (
              <div className="ip-card flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-800 flex items-center justify-center flex-shrink-0">
                  <CheckIcon className="w-5 h-5" />
                </span>
                <div>
                  <p className="font-heading font-semibold text-ip-on-surface">{t('loadConfirmed')}</p>
                  <p className="text-xs text-ip-on-surface-variant">{t('signedImmutableNote')}</p>
                </div>
              </div>
            ) : (
              <section>
                <h3 className="font-heading font-bold text-lg mb-1">{t('driverSignOff')}</h3>
                <p className="text-sm text-ip-on-surface-variant mb-ip-sm">{t('signOffConfirmation')}</p>
                <SignatureCanvas ref={sigRef} className="mb-ip-md" />
                <Button variant="secondary" size="lg" className="w-full" disabled={signing} onClick={confirmAndAccept}>
                  {signing ? t('submitting') : t('confirmAndAccept')}
                </Button>
              </section>
            )}
          </>
        )}

        {!loading && !manifest && error && (
          <div role="alert" className="flex items-start gap-2 rounded-ip-card bg-ip-error-container px-4 py-3 text-sm text-ip-on-error-container">
            <AlertIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
