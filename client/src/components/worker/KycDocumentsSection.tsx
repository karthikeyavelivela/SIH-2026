'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { DocumentUploadCard } from '@/components/ui/DocumentUploadCard';
import { AgentResultCard, type AgentResult } from '@/components/ui/AgentResultCard';
import type { KycDocumentType } from '@fyro/shared';

interface KycDocument {
  type: KycDocumentType;
  url: string;
  status: 'under_review' | 'verified' | 'rejected';
  rejectionReason?: string;
}

const DOC_TYPE_LABEL: Record<KycDocumentType, string> = {
  driving_licence: 'Driving Licence',
  vehicle_rc: 'Vehicle RC',
  fastag: 'FASTag',
  goods_carriage_permit: 'Goods Carriage Permit',
  puc: 'PUC Certificate',
  vehicle_fitness: 'Vehicle Fitness Certificate',
  aadhaar: 'Aadhaar',
  pan: 'PAN',
  gstin: 'GSTIN',
};

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface KycDocumentsSectionProps {
  /** Which document types this role needs — pass REQUIRED_KYC_DOCS_BY_ROLE[role]. */
  requiredTypes: KycDocumentType[];
}

// The other half of DocumentUploadCard.tsx, which previously had zero
// callers anywhere in the app (see AUDIT_REPORT.md Section D item 1) — this
// is what actually lets a driver/hamali/mutha_member/fleet_owner/
// warehouse_hub upload the documents availability.controller.ts's KYC gate
// (Phase 1.3) checks for. Minimal wiring for Phase 1 — Phase 2 folds this
// into the full shared profile architecture for every role, this component
// is written to be reused there rather than thrown away.
export function KycDocumentsSection({ requiredTypes }: KycDocumentsSectionProps) {
  const t = useTranslations('agents.documentPrecheck');
  const [docs, setDocs] = useState<KycDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingType, setUploadingType] = useState<KycDocumentType | null>(null);
  const [precheckType, setPrecheckType] = useState<KycDocumentType | null>(null);
  const [precheckResults, setPrecheckResults] = useState<Partial<Record<KycDocumentType, AgentResult>>>({});

  useEffect(() => {
    api
      .get<{ documents: KycDocument[] }>('/api/kyc/documents')
      .then((res) => setDocs(res.documents))
      .catch(() => setDocs([]));
  }, []);

  async function handleUpload(type: KycDocumentType, file: File) {
    setUploadingType(type);
    setError(null);
    try {
      const fileBase64 = await readAsBase64(file);
      const res = await api.post<{ document: KycDocument }>('/api/kyc/documents', { type, fileBase64 });
      setDocs((prev) => {
        const others = (prev ?? []).filter((d) => d.type !== type);
        return [...others, res.document];
      });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not upload — try again.');
    } finally {
      setUploadingType(null);
    }
  }

  async function handlePrecheck(type: KycDocumentType) {
    setPrecheckType(type);
    setError(null);
    try {
      const res = await api.post<{ result: AgentResult }>('/api/agents/document-precheck', { documentType: type });
      setPrecheckResults((prev) => ({ ...prev, [type]: res.result }));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('error'));
    } finally {
      setPrecheckType(null);
    }
  }

  if (requiredTypes.length === 0) return null;
  if (docs === null) {
    return <div className="h-32 rounded-ip-card bg-ip-surface-container animate-pulse mb-6" />;
  }

  return (
    <div className="mb-6">
      <h2 className="font-heading text-lg font-bold mb-3">Documents</h2>
      <div className="space-y-2.5">
        {requiredTypes.map((type) => {
          const doc = docs.find((d) => d.type === type);
          const precheckResult = precheckResults[type];
          return (
            <div key={type}>
              <DocumentUploadCard
                label={DOC_TYPE_LABEL[type]}
                status={uploadingType === type ? 'pending' : doc ? doc.status === 'under_review' ? 'pending' : doc.status : 'missing'}
                rejectionReason={doc?.rejectionReason}
                onUpload={(file) => handleUpload(type, file)}
              />
              {doc && doc.status !== 'verified' && (
                <div className="mt-1.5 ml-1">
                  {precheckResult ? (
                    <AgentResultCard result={precheckResult} accent="secondary" />
                  ) : (
                    <button
                      type="button"
                      disabled={precheckType === type}
                      onClick={() => handlePrecheck(type)}
                      className="text-xs font-semibold text-ip-secondary hover:underline disabled:opacity-50"
                    >
                      {precheckType === type ? t('checking') : t('action')}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="text-xs text-ip-error mt-2">{error}</p>}
    </div>
  );
}
