'use client';

import { useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { MetricCard } from '@/components/ui/MetricCard';
import { StatusChip } from '@/components/ui/StatusChip';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { DataTable } from '@/components/admin/DataTable';
import { TruckIcon, UsersIcon, AlertIcon, PlusIcon } from '@/components/ui/icons';

interface FleetDriverSummary {
  _id: string;
  name: string;
  phone: string;
  ratingAvg: number;
  ratingCount: number;
  accountStatus: string;
}

interface FleetVehicleSummary {
  _id: string;
  type: string;
  capacityKg: number;
  registrationNumber: string;
  availabilityStatus: 'online' | 'offline' | 'on_job';
  verified: boolean;
  assignedDriverId?: FleetDriverSummary | null;
}

interface FleetDoc {
  _id: string;
  name: string;
  vehicleIds: FleetVehicleSummary[];
  driverIds: FleetDriverSummary[];
}

const VEHICLE_TYPE_OPTIONS = [
  { value: 'mini_truck', label: 'Mini truck' },
  { value: 'medium_truck', label: 'Medium truck' },
  { value: 'large_truck', label: 'Large truck' },
];

const inputClass =
  'w-full min-h-[44px] px-4 py-2.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-ip-on-surface placeholder:text-ip-on-surface-variant/70 transition-colors focus:border-ip-primary focus:ring-2 focus:ring-ip-primary/20';

function availabilityTone(status: FleetVehicleSummary['availabilityStatus']): 'success' | 'primary' | 'muted' {
  if (status === 'on_job') return 'primary';
  if (status === 'online') return 'success';
  return 'muted';
}

function availabilityLabel(status: FleetVehicleSummary['availabilityStatus']): string {
  if (status === 'on_job') return 'On job';
  if (status === 'online') return 'Online';
  return 'Offline';
}

export default function FleetOwnerDashboardPage() {
  const { data, state, error, reload } = usePolling(() => api.get<{ fleet: FleetDoc }>('/api/fleet/me'), 20000);
  const fleet = data?.fleet;

  const [registerOpen, setRegisterOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [vehicleForm, setVehicleForm] = useState({ vehicleType: 'mini_truck', capacityKg: '', registrationNumber: '' });
  const [assignForm, setAssignForm] = useState({ vehicleId: '', driverId: '' });

  async function handleRegisterVehicle(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await api.post('/api/fleet/vehicles', {
        ...vehicleForm,
        capacityKg: Number(vehicleForm.capacityKg),
      });
      setVehicleForm({ vehicleType: 'mini_truck', capacityKg: '', registrationNumber: '' });
      setRegisterOpen(false);
      await reload();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Could not register vehicle');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAssignDriver(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await api.post('/api/fleet/assign-driver', assignForm);
      setAssignForm({ vehicleId: '', driverId: '' });
      setAssignOpen(false);
      await reload();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Could not assign driver');
    } finally {
      setSubmitting(false);
    }
  }

  function openAssignFor(vehicleId: string) {
    setFormError(null);
    setAssignForm({ vehicleId, driverId: '' });
    setAssignOpen(true);
  }

  if (state === 'loading') {
    return (
      <div className="max-w-6xl mx-auto">
        <Skeleton className="h-9 w-64 mb-2" />
        <Skeleton className="h-5 w-96 mb-8" />
        <div className="grid sm:grid-cols-3 gap-4 mb-10">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (state === 'error' || !fleet) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="ip-card">
          <EmptyState
            icon={<AlertIcon className="w-7 h-7" />}
            title="Couldn't load your fleet"
            description={error ?? 'No fleet found for this account.'}
            action={
              <Button variant="ghost" onClick={() => reload()}>
                Try again
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const totalVehicles = fleet.vehicleIds.length;
  const activeDrivers = fleet.driverIds.length;
  const unassignedUnits = fleet.vehicleIds.filter((v) => !v.assignedDriverId).length;

  return (
    <div className="max-w-6xl mx-auto animate-[fadeUp_400ms_ease-out]">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">Fleet console</p>
          <h1 className="font-heading text-ip-display-md font-extrabold mb-1">{fleet.name}</h1>
          <p className="text-sm text-ip-on-surface-variant">Real-time overview of your logistics assets.</p>
        </div>
        <div className="flex gap-2.5">
          <Button variant="ghost" onClick={() => { setFormError(null); setRegisterOpen(true); }}>
            <PlusIcon className="w-4 h-4 mr-1.5" /> Register vehicle
          </Button>
          <Button
            variant="primary"
            onClick={() => { setFormError(null); setAssignForm({ vehicleId: '', driverId: '' }); setAssignOpen(true); }}
          >
            Assign driver
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-10">
        <MetricCard label="Total vehicles" value={totalVehicles} icon={<TruckIcon className="w-5 h-5" />} />
        <MetricCard label="Active drivers" value={activeDrivers} icon={<UsersIcon className="w-5 h-5" />} />
        <MetricCard label="Unassigned units" value={unassignedUnits} icon={<AlertIcon className="w-5 h-5" />} />
      </div>

      <div>
        <h2 className="font-heading text-xl font-bold mb-4">Fleet roster</h2>
        <DataTable<FleetVehicleSummary>
          rows={fleet.vehicleIds}
          rowKey={(v) => v._id}
          emptyTitle="No vehicles yet"
          emptyDescription="Register your first vehicle to start building your roster."
          columns={[
            {
              key: 'unit',
              header: 'Unit ID',
              render: (v) => <span className="font-heading font-semibold">{v.registrationNumber}</span>,
            },
            {
              key: 'driver',
              header: 'Assigned driver',
              render: (v) =>
                v.assignedDriverId ? v.assignedDriverId.name : <span className="italic text-ip-on-surface-variant">Unassigned</span>,
            },
            {
              key: 'status',
              header: 'Status',
              render: (v) => (
                <StatusChip tone={availabilityTone(v.availabilityStatus)} dot>
                  {availabilityLabel(v.availabilityStatus)}
                </StatusChip>
              ),
            },
            {
              key: 'health',
              header: 'Health',
              render: () => <span className="text-ip-on-surface-variant text-xs italic">Not yet tracked</span>,
            },
            {
              key: 'action',
              header: '',
              className: 'text-right',
              render: (v) => (
                <button
                  type="button"
                  onClick={() => openAssignFor(v._id)}
                  className="text-ip-primary text-xs font-semibold uppercase tracking-wide hover:underline"
                >
                  {v.assignedDriverId ? 'Reassign' : 'Assign driver'}
                </button>
              ),
            },
          ]}
        />
      </div>

      <BottomSheet open={registerOpen} onClose={() => setRegisterOpen(false)} title="Register vehicle">
        <form onSubmit={handleRegisterVehicle} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-1.5">
              Vehicle type
            </label>
            <select
              value={vehicleForm.vehicleType}
              onChange={(e) => setVehicleForm({ ...vehicleForm, vehicleType: e.target.value })}
              className={inputClass}
            >
              {VEHICLE_TYPE_OPTIONS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-1.5">
              Capacity (kg)
            </label>
            <input
              type="number"
              min={1}
              required
              value={vehicleForm.capacityKg}
              onChange={(e) => setVehicleForm({ ...vehicleForm, capacityKg: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-1.5">
              Registration number
            </label>
            <input
              required
              value={vehicleForm.registrationNumber}
              onChange={(e) => setVehicleForm({ ...vehicleForm, registrationNumber: e.target.value })}
              className={inputClass}
            />
          </div>
          {formError && <p className="text-sm text-ip-error">{formError}</p>}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Registering…' : 'Register vehicle'}
          </Button>
        </form>
      </BottomSheet>

      <BottomSheet open={assignOpen} onClose={() => setAssignOpen(false)} title="Assign driver">
        <form onSubmit={handleAssignDriver} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-1.5">
              Vehicle
            </label>
            <select
              required
              value={assignForm.vehicleId}
              onChange={(e) => setAssignForm({ ...assignForm, vehicleId: e.target.value })}
              className={inputClass}
            >
              <option value="" disabled>
                Select a vehicle
              </option>
              {fleet.vehicleIds.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.registrationNumber} {v.assignedDriverId ? `(currently ${v.assignedDriverId.name})` : '(unassigned)'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-1.5">
              Driver's user ID
            </label>
            <input
              required
              placeholder="e.g. 65f1a2b3c4d5e6f7a8b9c0d1"
              value={assignForm.driverId}
              onChange={(e) => setAssignForm({ ...assignForm, driverId: e.target.value })}
              className={inputClass}
            />
            <p className="text-xs text-ip-on-surface-variant mt-1.5">
              The driver must already hold a driver account on FYRO. Ask them for their account ID, or have an admin
              share it with you.
            </p>
          </div>
          {formError && <p className="text-sm text-ip-error">{formError}</p>}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Assigning…' : 'Assign driver'}
          </Button>
        </form>
      </BottomSheet>
    </div>
  );
}
