'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { UserTable, AdminUserRow } from '@/components/admin/UserTable';
import { Pagination } from '@/components/ui/Pagination';
import { ConsoleHead, ConsoleSearch } from '@/components/admin/ConsoleHead';

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
      <ConsoleHead eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')} />

      <div className="mb-6">
        <ConsoleSearch
          value={search}
          onChange={setSearch}
          onSubmit={() => load(1)}
          placeholder={t('searchPlaceholder')}
        />
      </div>
      <UserTable users={users} onRoleChange={handleRoleChange} onStatusChange={handleStatusChange} />
      <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} onChange={(p) => load(p)} />
    </div>
  );
}
