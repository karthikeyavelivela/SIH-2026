'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { TreeView } from '@/components/admin/TreeView';
import { PermissionPicker } from '@/components/admin/PermissionPicker';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/lib/auth-context';

interface ManagerRow {
  _id: string;
  name: string;
  phone: string;
  permissions: string[];
}

const inputClass =
  'w-full min-h-[44px] px-4 py-2.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-ip-on-surface placeholder:text-ip-on-surface-variant/70 transition-colors focus:border-ip-primary focus:ring-2 focus:ring-ip-primary/20';

function ErrorAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-ip-input border border-ip-error/30 bg-ip-error-container/40 px-4 py-3 text-sm text-ip-on-error-container animate-[fadeIn_200ms_ease-out]"
    >
      <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M18 10A8 8 0 112 10a8 8 0 0116 0zm-7-4a1 1 0 10-2 0v4a1 1 0 102 0V6zm-1 8a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
      <p>{message}</p>
    </div>
  );
}

// Restyled onto the ip-* tonal system per DESIGN_INVENTORY.md — TreeView /
// PermissionPicker (components/admin/*) are untouched; all fetch/mutation
// logic below (including the edit-existing-manager flow) is unchanged.
export default function AdminManagersPage() {
  const { user } = useAuth();
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [form, setForm] = useState({ name: '', phone: '', password: '' });
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [editingManager, setEditingManager] = useState<ManagerRow | null>(null);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  async function load() {
    const res = await api.get<{ managers: ManagerRow[] }>('/api/admin/managers');
    setManagers(res.managers);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/api/admin/managers', { ...form, permissions });
      setForm({ name: '', phone: '', password: '' });
      setPermissions([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create manager');
    }
  }

  function openEdit(manager: ManagerRow) {
    setEditingManager(manager);
    setEditPermissions(manager.permissions);
    setEditError(null);
  }

  function closeEdit() {
    setEditingManager(null);
    setEditError(null);
  }

  async function handleSaveEdit() {
    if (!editingManager) return;
    setEditError(null);
    setEditSaving(true);
    try {
      await api.patch(`/api/admin/managers/${editingManager._id}/permissions`, {
        permissions: editPermissions,
      });
      await load();
      closeEdit();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update permissions');
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-10 animate-[fadeUp_400ms_ease-out]">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">Structure</p>
        <h1 className="font-heading text-ip-display-md font-extrabold mb-1">Org tree</h1>
        <p className="text-sm text-ip-on-surface-variant mb-6">
          Admin at the root, managers and their granted permissions below.
        </p>
        <TreeView adminName={user?.name ?? 'Admin'} managers={managers} onEditManager={openEdit} />
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-secondary mb-2">Onboard</p>
        <h2 className="font-heading text-ip-headline-sm font-bold mb-1">Create manager</h2>
        <p className="text-sm text-ip-on-surface-variant mb-6">Grant a new manager access with scoped permissions.</p>
        <div className="ip-card">
          <form onSubmit={handleCreate} className="space-y-4">
            <input
              placeholder="Name"
              aria-label="Name"
              autoComplete="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputClass}
              required
            />
            <input
              placeholder="Phone"
              aria-label="Phone"
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={inputClass}
              required
            />
            <input
              type="password"
              placeholder="Password"
              aria-label="Password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={inputClass}
              required
              minLength={8}
            />
            <div className="pt-2 border-t border-ip-outline/10">
              <PermissionPicker permissions={permissions} onChange={setPermissions} />
            </div>
            {error && <ErrorAlert message={error} />}
            <Button type="submit" className="w-full" size="lg">
              Create manager
            </Button>
          </form>
        </div>
      </div>

      <Modal
        open={!!editingManager}
        onClose={closeEdit}
        title={editingManager ? `Edit permissions — ${editingManager.name}` : 'Edit permissions'}
        footer={
          <>
            <Button variant="ghost" onClick={closeEdit} disabled={editSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={editSaving}>
              {editSaving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <PermissionPicker permissions={editPermissions} onChange={setEditPermissions} />
        {editError && (
          <div className="mt-3">
            <ErrorAlert message={editError} />
          </div>
        )}
      </Modal>
    </div>
  );
}
