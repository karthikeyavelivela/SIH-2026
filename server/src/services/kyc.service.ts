import type { Role, KycDocumentType, AppLocale } from '@fyro/shared';
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

// Duplicated from the client's DOC_TYPE_LABEL rather than shared across the
// client/server boundary, since no shared UI-string module exists yet
// either. Locale-aware since Phase 2 (server-side i18n) — this is the one
// deterministic, worker-facing gate message named explicitly in that
// phase's scope; an admin's free-text KYC *rejection reason* is separate,
// arbitrary human-authored input that a fixed catalog can't translate.
const DOC_TYPE_LABEL: Record<AppLocale, Record<KycDocumentType, string>> = {
  en: {
    driving_licence: 'Driving Licence',
    vehicle_rc: 'Vehicle RC',
    fastag: 'FASTag',
    goods_carriage_permit: 'Goods Carriage Permit',
    puc: 'PUC Certificate',
    vehicle_fitness: 'Vehicle Fitness Certificate',
    aadhaar: 'Aadhaar',
    pan: 'PAN',
    gstin: 'GSTIN',
  },
  te: {
    driving_licence: 'డ్రైవింగ్ లైసెన్స్',
    vehicle_rc: 'వాహన RC',
    fastag: 'ఫాస్టాగ్',
    goods_carriage_permit: 'గూడ్స్ క్యారేజ్ పర్మిట్',
    puc: 'PUC సర్టిఫికేట్',
    vehicle_fitness: 'వాహన ఫిట్‌నెస్ సర్టిఫికేట్',
    aadhaar: 'ఆధార్',
    pan: 'పాన్',
    gstin: 'జీఎస్టీఐఎన్',
  },
  hi: {
    driving_licence: 'ड्राइविंग लाइसेंस',
    vehicle_rc: 'वाहन आरसी',
    fastag: 'फास्टैग',
    goods_carriage_permit: 'गुड्स कैरिज परमिट',
    puc: 'पीयूसी सर्टिफिकेट',
    vehicle_fitness: 'वाहन फिटनेस सर्टिफिकेट',
    aadhaar: 'आधार',
    pan: 'पैन',
    gstin: 'जीएसटीआईएन',
  },
};

const GATE_TEMPLATE: Record<AppLocale, (labels: string) => string> = {
  en: (labels) => `Upload and get verified on these documents before going online: ${labels}. Go to your profile to upload them.`,
  te: (labels) => `ఆన్‌లైన్‌లోకి వెళ్లే ముందు ఈ డాక్యుమెంట్లను అప్‌లోడ్ చేసి వెరిఫై చేసుకోండి: ${labels}. వాటిని అప్‌లోడ్ చేయడానికి మీ ప్రొఫైల్‌కి వెళ్లండి.`,
  hi: (labels) => `ऑनलाइन जाने से पहले इन दस्तावेज़ों को अपलोड करके सत्यापित करवाएं: ${labels}. उन्हें अपलोड करने के लिए अपनी प्रोफ़ाइल पर जाएं।`,
};

export function kycGateMessage(outstanding: KycDocumentType[], locale: AppLocale = 'en'): string {
  const labels = outstanding.map((docType) => DOC_TYPE_LABEL[locale][docType]).join(', ');
  return GATE_TEMPLATE[locale](labels);
}
