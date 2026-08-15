'use client';

import { useAuth } from '@/lib/auth-context';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { UserIcon } from '@/components/ui/icons';

// Mutha leaders had no way to log out at all before this page existed —
// found live: /mutha's bottom tabs were Group/Requests/Jobs/Members/
// Earnings, none of which carry a logout affordance, unlike every other
// role.
export default function MuthaLeaderProfilePage() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <h1 className="font-heading text-2xl font-bold mb-6">Profile</h1>

      <Card elevation="raised" className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-secondary/15 text-secondary-600 flex items-center justify-center flex-shrink-0">
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

      <Button variant="ghost" className="w-full" onClick={() => logout()}>
        Log out
      </Button>
    </div>
  );
}
