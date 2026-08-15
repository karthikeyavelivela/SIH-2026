'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { UserIcon, AlertIcon, ChevronRightIcon } from '@/components/ui/icons';

export default function CustomerProfilePage() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <h1 className="font-heading text-2xl font-bold mb-6">Profile</h1>

      <Card elevation="raised" className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-primary/15 text-primary-600 flex items-center justify-center flex-shrink-0">
          <UserIcon className="w-7 h-7" />
        </div>
        <div>
          <p className="font-heading font-bold text-lg">{user.name}</p>
          <p className="text-sm text-text-muted">{user.phone}</p>
          <Badge tone="secondary" className="mt-1.5">
            {user.accountStatus}
          </Badge>
        </div>
      </Card>

      <Link
        href="/customer/support"
        className="flex items-center justify-between p-4 mb-6 rounded-lg bg-surface-raised border border-border shadow-sm hover:shadow-md transition-all duration-base"
      >
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-primary/10 text-primary-600 flex items-center justify-center">
            <AlertIcon className="w-5 h-5" />
          </span>
          <p className="text-sm font-semibold">Support</p>
        </div>
        <ChevronRightIcon className="w-4 h-4 text-text-muted" />
      </Link>

      <Button variant="ghost" className="w-full" onClick={() => logout()}>
        Log out
      </Button>
    </div>
  );
}
