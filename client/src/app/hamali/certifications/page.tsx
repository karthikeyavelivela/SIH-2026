'use client';

import { CertificationList } from '@/components/worker/CertificationList';

export default function HamaliCertificationsPage() {
  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <h1 className="font-heading text-xl font-bold mb-1">Certifications</h1>
      <p className="text-sm text-text-muted mb-6">Endorsed skills, valid dates, and a scannable site-verification code.</p>
      <CertificationList />
    </div>
  );
}
