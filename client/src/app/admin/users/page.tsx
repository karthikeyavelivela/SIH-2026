'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { UserTable, AdminUserRow } from '@/components/admin/UserTable';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [search, setSearch] = useState('');

  async function load() {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    const res = await api.get<{ users: AdminUserRow[] }>(`/api/admin/users${query}`);
    setUsers(res.users);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRoleChange(id: string, role: string) {
    await api.patch(`/api/admin/users/${id}/role`, { role });
    await load();
  }

  async function handleStatusChange(id: string, status: string) {
    await api.patch(`/api/admin/users/${id}/status`, { status });
    await load();
  }

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-6">Users</h1>
      <div className="flex gap-3 mb-6">
        <input
          placeholder="Search by name or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          className="px-4 py-2 rounded-xl border border-black/10 bg-background flex-1 max-w-sm"
        />
      </div>
      <UserTable users={users} onRoleChange={handleRoleChange} onStatusChange={handleStatusChange} />
    </div>
  );
}
