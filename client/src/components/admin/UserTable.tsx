'use client';

import { useState } from 'react';
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

interface UserTableProps {
  users: AdminUserRow[];
  onRoleChange: (id: string, role: string) => Promise<void>;
  onStatusChange: (id: string, status: string) => Promise<void>;
}

export function UserTable({ users, onRoleChange, onStatusChange }: UserTableProps) {
  const [pendingAction, setPendingAction] = useState<
    { userId: string; kind: 'role' | 'suspend' | 'delete'; value?: string } | null
  >(null);

  async function confirmAction() {
    if (!pendingAction) return;
    if (pendingAction.kind === 'role' && pendingAction.value) {
      await onRoleChange(pendingAction.userId, pendingAction.value);
    } else if (pendingAction.kind === 'suspend') {
      await onStatusChange(pendingAction.userId, 'suspended');
    } else if (pendingAction.kind === 'delete') {
      await onStatusChange(pendingAction.userId, 'deleted');
    }
    setPendingAction(null);
  }

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-black/5">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id} className="border-t border-black/5">
                <td className="px-4 py-3">{u.name}</td>
                <td className="px-4 py-3">{u.phone}</td>
                <td className="px-4 py-3">
                  <select
                    defaultValue={u.role}
                    onChange={(e) => setPendingAction({ userId: u._id, kind: 'role', value: e.target.value })}
                    className="border border-black/10 rounded-lg px-2 py-1 bg-background"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={u.accountStatus === 'active' ? 'secondary' : 'muted'}>{u.accountStatus}</Badge>
                </td>
                <td className="px-4 py-3 flex gap-2">
                  <Button variant="ghost" onClick={() => setPendingAction({ userId: u._id, kind: 'suspend' })}>
                    Suspend
                  </Button>
                  <Button variant="danger" onClick={() => setPendingAction({ userId: u._id, kind: 'delete' })}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!pendingAction}
        onClose={() => setPendingAction(null)}
        title="Confirm action"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingAction(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmAction}>
              Confirm
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-muted">
          {pendingAction?.kind === 'role' && `Change role to "${pendingAction.value}"?`}
          {pendingAction?.kind === 'suspend' && 'Suspend this account?'}
          {pendingAction?.kind === 'delete' && 'Delete this account? This is a soft delete and can be reversed by an admin.'}
        </p>
      </Modal>
    </>
  );
}
