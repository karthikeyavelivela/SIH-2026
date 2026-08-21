'use client';

import { useAuth } from '@/lib/auth-context';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { AvatarUpload } from '@/components/ui/AvatarUpload';
import { KycDocumentsSection } from '@/components/worker/KycDocumentsSection';
import { REQUIRED_KYC_DOCS_BY_ROLE } from '@fyro/shared';

// Mutha members had no logout affordance at all — /mutha-member only had
// Job and Earnings tabs before this page existed.
export default function MuthaMemberProfilePage() {
  const { user, logout, refetch } = useAuth();
  if (!user) return null;

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <h1 className="font-heading text-2xl font-bold mb-6">Profile</h1>

      <Card elevation="raised" className="flex items-center gap-4 mb-6">
        <AvatarUpload name={user.name} photoUrl={user.profilePhoto} accent="secondary" onUploaded={refetch} />
        <div>
          <p className="font-heading font-bold text-lg">{user.name}</p>
          <p className="text-sm text-text-muted">{user.phone}</p>
          <Badge tone="secondary" className="mt-1.5">
            {user.accountStatus}
          </Badge>
        </div>
      </Card>

      <KycDocumentsSection requiredTypes={REQUIRED_KYC_DOCS_BY_ROLE.mutha_member} />

      <Button variant="ghost" className="w-full" onClick={() => logout()}>
        Log out
      </Button>
    </div>
  );
}
