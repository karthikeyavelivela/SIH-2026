'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading || !user || user.role !== 'admin') {
    return <div className="min-h-screen flex items-center justify-center text-text-muted">Loading…</div>;
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r border-black/5 p-6 hidden md:block">
        <p className="font-heading font-bold text-primary mb-8">FYRO Admin</p>
        <nav className="flex flex-col gap-3 text-sm">
          <Link href="/admin/users" className="hover:text-primary">
            Users
          </Link>
          <Link href="/admin/managers" className="hover:text-primary">
            Managers
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-6 md:p-10">{children}</main>
    </div>
  );
}
