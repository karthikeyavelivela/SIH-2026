'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { UserTable, AdminUserRow } from '@/components/admin/UserTable';
import { Pagination } from '@/components/ui/Pagination';
import { SearchIcon } from '@/components/ui/icons';

const PAGE_SIZE = 20;

// Restyled onto the ip-* tonal system per DESIGN_INVENTORY.md's
// user_management/user_management_portal rows — UserTable itself
// (components/admin/UserTable.tsx) is untouched, all fetch/mutation logic
// below is identical to before this pass.
export default function AdminUsersPage() {
  const t = useTranslations('adminUsers');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  async function load(targetPage = page) {
    const params = new URLSearchParams({ page: String(targetPage), limit: String(PAGE_SIZE) });
    if (search) params.set('search', search);
    const res = await api.get<{ users: AdminUserRow[]; total: number; page: number }>(
      `/api/admin/users?${params.toString()}`
    );
    setUsers(res.users);
    setTotal(res.total);
    setPage(res.page);
  }

  useEffect(() => {
    load(1);
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
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">{t('eyebrow')}</p>
      <h1 className="font-heading text-ip-display-md font-extrabold mb-1">{t('title')}</h1>
      <p className="text-sm text-ip-on-surface-variant mb-7">{t('subtitle')}</p>

      <div className="flex gap-3 mb-6">
        <div className="relative w-full max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ip-outline" />
          <input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load(1)}
            className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface-container-lowest shadow-sm text-ip-on-surface placeholder:text-ip-on-surface-variant/70 transition-colors focus:border-ip-primary focus:ring-2 focus:ring-ip-primary/20"
          />
        </div>
      </div>
      <UserTable users={users} onRoleChange={handleRoleChange} onStatusChange={handleStatusChange} />
      <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} onChange={(p) => load(p)} />
    </div>
  );
}
