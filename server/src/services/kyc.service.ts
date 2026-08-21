import type { Role, KycDocumentType } from '@fyro/shared';
import { REQUIRED_KYC_DOCS_BY_ROLE } from '@fyro/shared';
import { IUser } from '../models/User';

/**
 * Which of a role's required document types are missing or not yet
 * verified — used both by availability.controller.ts's KYC gate (Phase 1.3)
 * to build a clear, specific "here's what's still outstanding" error, and
 * by the profile-page document list to know which tiles to show as
 * outstanding. A document that's 'under_review' still counts as
 * outstanding here — under review is not verified.
 */
export function outstandingKycDocs(user: Pick<IUser, 'role' | 'kycDocs'>): KycDocumentType[] {
  const required = REQUIRED_KYC_DOCS_BY_ROLE[user.role as Role] ?? [];
  return required.filter((type) => {
    const doc = user.kycDocs.find((d) => d.type === type);
    return !doc || doc.status !== 'verified';
  });
}

export function isKycComplete(user: Pick<IUser, 'role' | 'kycDocs'>): boolean {
  return outstandingKycDocs(user).length === 0;
}

// Server-side error copy is English-only across the whole codebase today
// (see AUDIT_REPORT.md's multilingual section — Phase 5 of the remediation
// build is what adds server-side i18n; this deliberately isn't ahead of
// that). Duplicated from the client's DOC_TYPE_LABEL rather than shared
// across the client/server boundary, since no shared UI-string module
// exists yet either.
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

export function kycGateMessage(outstanding: KycDocumentType[]): string {
  const labels = outstanding.map((t) => DOC_TYPE_LABEL[t]).join(', ');
  return `Upload and get verified on these documents before going online: ${labels}. Go to your profile to upload them.`;
}
