'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { TreeView } from '@/components/admin/TreeView';
import { PermissionPicker } from '@/components/admin/PermissionPicker';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/lib/auth-context';

interface ManagerRow {
  _id: string;
  name: string;
  phone: string;
  permissions: string[];
}

export default function AdminManagersPage() {
  const { user } = useAuth();
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [form, setForm] = useState({ name: '', phone: '', password: '' });
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Edit-existing-manager flow. The spec requires an "edit-permissions
  // action" for managers already in the tree — the backend has supported
  // this since Task 10 (PATCH /api/admin/managers/:id/permissions,
  // audit-logged), this page just didn't expose it until now.
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
    <div className="grid lg:grid-cols-2 gap-10">
      <div>
        <h1 className="font-heading text-2xl font-bold mb-6">Org tree</h1>
        <TreeView adminName={user?.name ?? 'Admin'} managers={managers} onEditManager={openEdit} />
      </div>

      <div>
        <h2 className="font-heading text-xl font-bold mb-6">Create manager</h2>
        <Card>
          <form onSubmit={handleCreate} className="space-y-4">
            <input
              placeholder="Name"
              aria-label="Name"
              autoComplete="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
              required
            />
            <input
              placeholder="Phone"
              aria-label="Phone"
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
              required
            />
            <input
              type="password"
              placeholder="Password"
              aria-label="Password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
              required
              minLength={8}
            />
            <PermissionPicker permissions={permissions} onChange={setPermissions} />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full">
              Create manager
            </Button>
          </form>
        </Card>
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
        {editError && <p className="text-sm text-red-600 mt-3">{editError}</p>}
      </Modal>
    </div>
  );
}
