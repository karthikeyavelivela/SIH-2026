'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { TreeView } from '@/components/admin/TreeView';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth-context';

const PERMISSION_OPTIONS = ['verify_kyc', 'resolve_complaints', 'edit_fare_rules', 'view_analytics'];

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
  const [regionInput, setRegionInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await api.get<{ managers: ManagerRow[] }>('/api/admin/managers');
    setManagers(res.managers);
  }

  useEffect(() => {
    load();
  }, []);

  function togglePermission(p: string) {
    setPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function addRegion() {
    if (!regionInput.trim()) return;
    setPermissions((prev) => [...prev, `manage_region:${regionInput.trim()}`]);
    setRegionInput('');
  }

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

  return (
    <div className="grid lg:grid-cols-2 gap-10">
      <div>
        <h1 className="font-heading text-2xl font-bold mb-6">Org tree</h1>
        <TreeView adminName={user?.name ?? 'Admin'} managers={managers} />
      </div>

      <div>
        <h2 className="font-heading text-xl font-bold mb-6">Create manager</h2>
        <Card>
          <form onSubmit={handleCreate} className="space-y-4">
            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
              required
            />
            <input
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
              required
              minLength={8}
            />
            <div>
              <p className="text-sm font-medium mb-2">Permissions</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {PERMISSION_OPTIONS.map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => togglePermission(p)}
                    className={`px-3 py-1.5 rounded-full text-xs border ${
                      permissions.includes(p) ? 'bg-secondary text-white border-secondary' : 'border-black/10'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  placeholder="Region name (e.g. Visakhapatnam)"
                  value={regionInput}
                  onChange={(e) => setRegionInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl border border-black/10 bg-background text-sm"
                />
                <Button type="button" variant="ghost" onClick={addRegion}>
                  Add region scope
                </Button>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full">
              Create manager
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
