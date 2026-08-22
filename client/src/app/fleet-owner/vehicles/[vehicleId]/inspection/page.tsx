'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { ChecklistItem } from '@/components/ui/ChecklistItem';
import { StatusChip } from '@/components/ui/StatusChip';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { CameraIcon, CheckIcon, AlertIcon } from '@/components/ui/icons';

type ChecklistState = 'pass' | 'warn' | 'fail' | 'pending';
type PhotoAngle = 'front' | 'rear' | 'driverSide' | 'passengerSide';

interface ChecklistRow {
  item: string;
  state: ChecklistState;
  note?: string;
}

interface FleetVehicleOption {
  _id: string;
  registrationNumber: string;
  complianceStatus?: 'compliant' | 'non_compliant';
}

interface InspectionRecord {
  _id: string;
  inspectedAt: string;
  overallVerdict: 'compliant' | 'non_compliant';
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function VehicleInspectionPage() {
  const t = useTranslations('vehicleInspection');
  const ANGLES: { key: PhotoAngle; label: string }[] = [
    { key: 'front', label: t('angleFront') },
    { key: 'rear', label: t('angleRear') },
    { key: 'driverSide', label: t('angleDriverSide') },
    { key: 'passengerSide', label: t('anglePassengerSide') },
  ];
  const DEFAULT_CHECKLIST: ChecklistRow[] = [
    { item: t('checklistItems.engineFluid'), state: 'pass' },
    { item: t('checklistItems.tyresBrakes'), state: 'pass' },
    { item: t('checklistItems.lightsSignals'), state: 'pass' },
    { item: t('checklistItems.documents'), state: 'pass' },
  ];
  const params = useParams<{ vehicleId: string }>();
  const vehicleId = params.vehicleId;

  const { data: fleetData } = usePolling(
    () => api.get<{ fleet: { vehicleIds: FleetVehicleOption[] } }>('/api/fleet/me'),
    60000
  );
  const { data: historyData, state: historyState, reload: reloadHistory } = usePolling(
    () => api.get<{ inspections: InspectionRecord[] }>(`/api/fleet/vehicles/${vehicleId}/inspections`),
    30000,
    [vehicleId]
  );

  const vehicle = fleetData?.fleet.vehicleIds.find((v) => v._id === vehicleId);
  const history = historyData?.inspections ?? [];
  const lastInspection = history[0];

  const [photos, setPhotos] = useState<Record<PhotoAngle, string | null>>({
    front: null,
    rear: null,
    driverSide: null,
    passengerSide: null,
  });
  const [checklist, setChecklist] = useState<ChecklistRow[]>(DEFAULT_CHECKLIST);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<'compliant' | 'non_compliant' | null>(null);

  async function handlePhoto(angle: PhotoAngle, file: File | undefined) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setPhotos((p) => ({ ...p, [angle]: dataUrl }));
  }

  function updateChecklistState(index: number, state: ChecklistState) {
    setChecklist((rows) => rows.map((r, i) => (i === index ? { ...r, state } : r)));
  }

  const allPhotosSet = ANGLES.every((a) => photos[a.key]);
  const anyPending = checklist.some((c) => c.state === 'pending');
  const computedVerdict: 'compliant' | 'non_compliant' = checklist.some((c) => c.state === 'fail')
    ? 'non_compliant'
    : 'compliant';

  async function handleSubmit() {
    setError(null);
    setSuccess(null);
    if (!allPhotosSet) {
      setError(t('errorAllPhotos'));
      return;
    }
    if (anyPending) {
      setError(t('errorAllChecklist'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ inspection: InspectionRecord }>(`/api/fleet/vehicles/${vehicleId}/inspections`, {
        photos,
        checklist: checklist.map((c) => ({ item: c.item, result: c.state, note: c.note })),
        overallVerdict: computedVerdict,
      });
      setSuccess(res.inspection.overallVerdict);
      setPhotos({ front: null, rear: null, driverSide: null, passengerSide: null });
      setChecklist(DEFAULT_CHECKLIST);
      await reloadHistory();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorSubmit'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto animate-[fadeUp_400ms_ease-out]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">{t('eyebrow')}</p>
      <h1 className="font-heading text-ip-display-md font-extrabold mb-1">{t('title')}</h1>
      <p className="text-sm text-ip-on-surface-variant mb-6">
        {t('unit', { reg: vehicle?.registrationNumber ?? vehicleId })}
        {lastInspection && t('lastInspected', { date: new Date(lastInspection.inspectedAt).toLocaleDateString('en-IN') })}
      </p>

      {vehicle?.complianceStatus === 'non_compliant' && (
        <AlertBanner tone="danger" icon={<AlertIcon className="w-4 h-4" />} className="mb-6">
          <span className="font-semibold">{t('nonCompliantBanner')}</span> {t('nonCompliantBannerRest')}
        </AlertBanner>
      )}

      {success && (
        <AlertBanner tone={success === 'compliant' ? 'success' : 'danger'} icon={<CheckIcon className="w-4 h-4" />} className="mb-6">
          {t('submittedVerdict')}<span className="font-semibold">{success === 'compliant' ? t('compliant') : t('nonCompliant')}</span>.
        </AlertBanner>
      )}

      <div className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-3">{t('exteriorPhotos')}</h2>
        <div className="grid grid-cols-2 gap-3">
          {ANGLES.map((a) => (
            <label
              key={a.key}
              className="relative aspect-square rounded-ip-card bg-ip-surface-container overflow-hidden flex flex-col items-center justify-center gap-2 cursor-pointer border border-ip-outline/10 hover:border-ip-primary/40 transition-colors"
            >
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handlePhoto(a.key, e.target.files?.[0])}
              />
              {photos[a.key] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photos[a.key]!} alt={a.label} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <CameraIcon className="w-6 h-6 text-ip-outline" />
              )}
              <span className="absolute bottom-2 left-2 bg-ip-inverse-surface/80 text-ip-inverse-on-surface px-2 py-1 rounded text-[10px] font-semibold uppercase">
                {a.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-2">{t('inspectionChecklist')}</h2>
        <div className="ip-card divide-y divide-ip-outline/10">
          {checklist.map((row, i) => (
            <ChecklistItem key={row.item} label={row.item} state={row.state} onStateChange={(s) => updateChecklistState(i, s)} />
          ))}
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-ip-on-surface-variant">{t('overallVerdict')}</span>
          <StatusChip tone={computedVerdict === 'compliant' ? 'success' : 'danger'} dot>
            {computedVerdict === 'compliant' ? t('compliant') : t('nonCompliant')}
          </StatusChip>
        </div>
      </div>

      {error && <p className="text-sm text-ip-error mb-4">{error}</p>}

      <Button className="w-full mb-10" disabled={submitting} onClick={handleSubmit}>
        {submitting ? t('submitting') : t('addInspection')}
      </Button>

      <div>
        <h2 className="font-heading text-lg font-bold mb-3">{t('inspectionHistory')}</h2>
        {historyState === 'loading' ? (
          <Skeleton className="h-24" />
        ) : history.length === 0 ? (
          <div className="ip-card">
            <EmptyState title={t('noInspections')} description={t('submitFirstAbove')} />
          </div>
        ) : (
          <div className="ip-card divide-y divide-ip-outline/10">
            {history.map((h) => (
              <div key={h._id} className="flex items-center justify-between py-3">
                <span className="text-sm text-ip-on-surface">{new Date(h.inspectedAt).toLocaleString('en-IN')}</span>
                <StatusChip tone={h.overallVerdict === 'compliant' ? 'success' : 'danger'}>
                  {h.overallVerdict === 'compliant' ? t('compliant') : t('nonCompliant')}
                </StatusChip>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
