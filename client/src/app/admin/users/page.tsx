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
    <div className="animate-[fadeUp_400ms_ease-out]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-600 mb-2">Directory</p>
      <h1 className="font-heading text-2xl font-bold mb-1">Users</h1>
      <p className="text-sm text-text-muted mb-7">Manage roles and account status across the platform.</p>

      <div className="flex gap-3 mb-6">
        <div className="relative w-full max-w-sm">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            placeholder="Search by name or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-md border border-border bg-surface-raised shadow-sm text-text-primary placeholder:text-text-muted/70 transition-colors duration-fast focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20"
          />
        </div>
      </div>
      <UserTable users={users} onRoleChange={handleRoleChange} onStatusChange={handleStatusChange} />
    </div>
  );
}
