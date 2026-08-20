'use client';

import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { CertificateCard } from '@/components/ui/CertificateCard';
import { ShieldIcon } from '@/components/ui/icons';

interface CertificationDoc {
  _id: string;
  title: string;
  endorsedSkills: string[];
  issuedAt: string;
  validUntil: string;
  status: 'active' | 'expired';
  qrPayload: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Shared presentational certification-list view for driver/hamali_solo —
// site-verification QR + endorsed skills per earned certificate, per
// certification_badge_status. Each role's certifications/page.tsx renders
// this directly (no accent variant needed — CertificateCard is neutral).
export function CertificationList() {
  const { data, state, error, reload } = usePolling(
    () => api.get<{ certifications: CertificationDoc[] }>('/api/training/certifications'),
    30000
  );
  const certs = data?.certifications ?? [];

  if (state === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (state === 'error') {
    return (
      <Card>
        <EmptyState title="Couldn't load your certifications" description={error ?? undefined} action={<Button onClick={() => reload()}>Try again</Button>} />
      </Card>
    );
  }

  if (certs.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<ShieldIcon className="w-7 h-7" />}
          title="No certifications yet"
          description="Complete every module in your training curriculum to earn your first certificate."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {certs.map((c) => (
        <CertificateCard
          key={c._id}
          title={c.title}
          skills={c.endorsedSkills}
          validFrom={formatDate(c.issuedAt)}
          validUntil={formatDate(c.validUntil)}
          qrValue={c.qrPayload}
          expired={c.status === 'expired'}
        />
      ))}
    </div>
  );
}
