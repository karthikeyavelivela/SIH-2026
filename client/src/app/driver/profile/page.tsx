'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { TopBar } from '@/components/ui/TopBar';
import { DocumentExpiryCard } from '@/components/worker/DocumentExpiryCard';
import { AvatarUpload } from '@/components/ui/AvatarUpload';
import { TruckIcon } from '@/components/ui/icons';

interface Vehicle {
  type: string;
  capacityKg: number;
  registrationNumber: string;
  verified: boolean;
  insuranceExpiryAt?: string;
}

export default function DriverProfilePage() {
  const { user, logout, refetch } = useAuth();
  const { data, state } = usePolling(() => api.get<{ vehicle: Vehicle }>('/api/vehicles/me').catch((err) => {
    if (err instanceof ApiClientError && err.status === 404) return { vehicle: null as unknown as Vehicle };
    throw err;
  }), 60000);
  const [licenseExpiryAt, setLicenseExpiryAt] = useState<string | null>(user?.licenseExpiryAt ?? null);
  const [insuranceExpiryAt, setInsuranceExpiryAt] = useState<string | null>(null);

  useEffect(() => {
    if (data?.vehicle?.insuranceExpiryAt !== undefined) setInsuranceExpiryAt(data.vehicle.insuranceExpiryAt ?? null);
  }, [data?.vehicle?.insuranceExpiryAt]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-ip-surface pb-24">
      <TopBar title="Profile" showBack={false} />
      <div className="max-w-lg mx-auto px-ip-edge pt-ip-sm">

      <div className="ip-card flex items-center gap-4 mb-6">
        <AvatarUpload name={user.name} photoUrl={user.profilePhoto} accent="primary" onUploaded={refetch} />
        <div>
          <p className="font-heading font-bold text-lg">{user.name}</p>
          <p className="text-sm text-ip-on-surface-variant">{user.phone}</p>
          <Badge tone="secondary" className="mt-1.5">
            {user.accountStatus}
          </Badge>
        </div>
      </div>

      <h2 className="font-heading text-lg font-bold mb-3">Vehicle</h2>
      {state === 'loading' && <div className="h-24 rounded-ip-card bg-ip-surface-container animate-pulse mb-6" />}
      {state !== 'loading' && !data?.vehicle && (
        <div className="ip-card text-center py-8 mb-6">
          <TruckIcon className="w-8 h-8 text-ip-on-surface-variant/50 mx-auto mb-3" />
          <p className="text-sm text-ip-on-surface-variant">No vehicle on file yet.</p>
        </div>
      )}
      {data?.vehicle && (
        <div className="ip-card mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="font-heading font-bold capitalize">{data.vehicle.type.replace('_', ' ')}</p>
            <Badge tone={data.vehicle.verified ? 'success' : 'muted'}>
              {data.vehicle.verified ? 'Verified' : 'Verification pending'}
            </Badge>
          </div>
          <p className="text-sm text-ip-on-surface-variant">Reg. {data.vehicle.registrationNumber}</p>
          <p className="text-sm text-ip-on-surface-variant">Capacity {data.vehicle.capacityKg} kg</p>
        </div>
      )}

      <DocumentExpiryCard
        license={licenseExpiryAt}
        insurance={insuranceExpiryAt}
        onSaved={(updated) => {
          if (updated.licenseExpiryAt !== undefined) setLicenseExpiryAt(updated.licenseExpiryAt ?? null);
          if (updated.insuranceExpiryAt !== undefined) setInsuranceExpiryAt(updated.insuranceExpiryAt ?? null);
        }}
      />

      <Button variant="ghost" className="w-full" onClick={() => logout()}>
        Log out
      </Button>
      </div>
    </div>
  );
}
