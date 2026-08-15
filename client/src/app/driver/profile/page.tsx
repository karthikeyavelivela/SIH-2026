'use client';

import { useAuth } from '@/lib/auth-context';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { UserIcon, TruckIcon } from '@/components/ui/icons';

interface Vehicle {
  type: string;
  capacityKg: number;
  registrationNumber: string;
  verified: boolean;
}

export default function DriverProfilePage() {
  const { user, logout } = useAuth();
  const { data, state } = usePolling(() => api.get<{ vehicle: Vehicle }>('/api/vehicles/me').catch((err) => {
    if (err instanceof ApiClientError && err.status === 404) return { vehicle: null as unknown as Vehicle };
    throw err;
  }), 60000);

  if (!user) return null;

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <h1 className="font-heading text-2xl font-bold mb-6">Profile</h1>

      <Card elevation="raised" className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-primary/15 text-primary-600 flex items-center justify-center flex-shrink-0">
          <UserIcon className="w-7 h-7" />
        </div>
        <div>
          <p className="font-heading font-bold text-lg">{user.name}</p>
          <p className="text-sm text-text-muted">{user.phone}</p>
          <Badge tone="secondary" className="mt-1.5">
            {user.accountStatus}
          </Badge>
        </div>
      </Card>

      <h2 className="font-heading text-lg font-bold mb-3">Vehicle</h2>
      {state === 'loading' && <div className="h-24 rounded-lg bg-surface animate-pulse mb-6" />}
      {state !== 'loading' && !data?.vehicle && (
        <Card elevation="raised" className="text-center py-8 mb-6">
          <TruckIcon className="w-8 h-8 text-text-muted/50 mx-auto mb-3" />
          <p className="text-sm text-text-muted">No vehicle on file yet.</p>
        </Card>
      )}
      {data?.vehicle && (
        <Card elevation="raised" className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="font-heading font-bold capitalize">{data.vehicle.type.replace('_', ' ')}</p>
            <Badge tone={data.vehicle.verified ? 'success' : 'muted'}>
              {data.vehicle.verified ? 'Verified' : 'Verification pending'}
            </Badge>
          </div>
          <p className="text-sm text-text-muted">Reg. {data.vehicle.registrationNumber}</p>
          <p className="text-sm text-text-muted">Capacity {data.vehicle.capacityKg} kg</p>
        </Card>
      )}

      <Button variant="ghost" className="w-full" onClick={() => logout()}>
        Log out
      </Button>
    </div>
  );
}
