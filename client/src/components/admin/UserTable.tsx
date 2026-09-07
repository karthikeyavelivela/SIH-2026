'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

export interface AdminUserRow {
  _id: string;
  name: string;
  phone: string;
  role: string;
  accountStatus: string;
}

const ROLE_OPTIONS = ['customer', 'driver', 'hamali_solo', 'mutha_leader', 'mutha_member'];

// Presentational-only tone mapping for the status Badge — purely cosmetic,
// does not affect which status values exist or how they're stored/sent.
function statusTone(status: string): 'success' | 'danger' | 'muted' | 'secondary' {
  if (status === 'active') return 'success';
  if (status === 'suspended') return 'danger';
  if (status === 'deleted') return 'muted';
  return 'secondary';
}

interface UserTableProps {
  users: AdminUserRow[];
  onRoleChange: (id: string, role: string) => Promise<void>;
  onStatusChange: (id: string, status: string) => Promise<void>;
}

export function UserTable({ users, onRoleChange, onStatusChange }: UserTableProps) {
  const t = useTranslations('userTable');
  const [pendingAction, setPendingAction] = useState<
    { userId: string; kind: 'role' | 'suspend' | 'delete'; value?: string } | null
  >(null);
  // Guards against a fast double-click firing the mutation (and its audit
  // log write) twice while the first PATCH is still in flight.
  const [confirming, setConfirming] = useState(false);

  async function confirmAction() {
    if (!pendingAction || confirming) return;
    setConfirming(true);
    try {
      if (pendingAction.kind === 'role' && pendingAction.value) {
        await onRoleChange(pendingAction.userId, pendingAction.value);
      } else if (pendingAction.kind === 'suspend') {
        await onStatusChange(pendingAction.userId, 'suspended');
      } else if (pendingAction.kind === 'delete') {
        await onStatusChange(pendingAction.userId, 'deleted');
      }
      setPendingAction(null);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <>
      <div className="overflow-x-auto rounded-card border border-fy-hairline bg-fy-card shadow-md">
        <table className="w-full text-sm">
          <thead className="bg-fy-panel text-left">
            <tr>
              <th scope="col" className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wide text-fy-muted">
                {t('name')}
              </th>
              <th scope="col" className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wide text-fy-muted">
                {t('phone')}
              </th>
              <th scope="col" className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wide text-fy-muted">
                {t('role')}
              </th>
              <th scope="col" className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wide text-fy-muted">
                {t('status')}
              </th>
              <th scope="col" className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wide text-fy-muted">
                {t('actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-fy-muted text-sm">
                  {t('noUsers')}
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u._id} className="border-t border-fy-hairline transition-colors hover:bg-fy-panel/60">
                <td className="px-5 py-3.5 font-medium">{u.name}</td>
                <td className="px-5 py-3.5 text-fy-muted">{u.phone}</td>
                <td className="px-5 py-3.5">
                  <select
                    aria-label={t('roleAria', { name: u.name })}
                    // Controlled: while a change to THIS row is pending
                    // confirmation, show the pending value; otherwise show
                    // the server-confirmed role. Uncontrolled (defaultValue)
                    // would leave the dropdown stuck on a cancelled pick
                    // instead of reverting to the actual current role.
                    value={
                      pendingAction?.userId === u._id && pendingAction.kind === 'role'
                        ? pendingAction.value
                        : u.role
                    }
                    onChange={(e) => setPendingAction({ userId: u._id, kind: 'role', value: e.target.value })}
                    className="border border-fy-hairline rounded-control px-3 py-2 bg-fy-bone text-sm cursor-pointer transition-colors duration-fast focus:border-fy-brown focus:ring-2 focus:ring-fy-brown/20"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {t(`roles.${r}`)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-5 py-3.5">
                  <Badge tone={statusTone(u.accountStatus)}>{t(`accountStatus.${u.accountStatus}`)}</Badge>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      aria-label={t('suspendAria', { name: u.name })}
                      onClick={() => setPendingAction({ userId: u._id, kind: 'suspend' })}
                    >
                      {t('suspend')}
                    </Button>
                    <Button
                      variant="danger"
                      aria-label={t('deleteAria', { name: u.name })}
                      onClick={() => setPendingAction({ userId: u._id, kind: 'delete' })}
                    >
                      {t('delete')}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!pendingAction}
        onClose={() => setPendingAction(null)}
        title={t('confirmAction')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingAction(null)} disabled={confirming}>
              {t('cancel')}
            </Button>
            <Button variant="danger" onClick={confirmAction} disabled={confirming}>
              {confirming ? t('working') : t('confirm')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-fy-muted">
          {pendingAction?.kind === 'role' && t('changeRoleTo', { role: pendingAction.value ?? '' })}
          {pendingAction?.kind === 'suspend' && t('suspendConfirm')}
          {pendingAction?.kind === 'delete' && t('deleteConfirm')}
        </p>
      </Modal>
    </>
  );
}
