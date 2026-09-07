'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { api, ApiClientError } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { AvatarUpload } from '@/components/ui/AvatarUpload';
import { LockIcon } from '@/components/ui/icons';
import { LanguageSection, ProfileIdentitySection, AccountDangerZoneSection } from '@/components/worker/ProfileSections';

// Neither admin nor manager had a profile page at all before this — see
// AUDIT_REPORT.md's finding on the manager route tree (already fixed
// elsewhere, admin/layout.tsx now correctly serves both roles).
export default function AdminProfilePage() {
  const t = useTranslations('profile');
  const tAdmin = useTranslations('adminProfile');
  const { user, refetch } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  const isManager = user.role === 'manager';

  async function logoutEverywhere() {
    setLoggingOut(true);
    setError(null);
    try {
      await api.post('/api/auth/me/logout-everywhere');
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : tAdmin('errorGeneric'));
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="animate-[fadeUp_400ms_ease-out]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-fy-brown mb-2">{t('accountEyebrow')}</p>
      <h1 className="font-heading text-heading font-extrabold mb-6">{t('pageTitle')}</h1>

      <div className="fy-surface-card flex items-center gap-4 mb-6 max-w-2xl">
        <AvatarUpload name={user.name} photoUrl={user.profilePhoto} accent="primary" onUploaded={refetch} />
        <div>
          <p className="font-heading font-bold text-lg">{user.name}</p>
          <p className="text-sm text-fy-ink-soft">{user.phone}</p>
          <Badge tone={isManager ? 'secondary' : 'success'} className="mt-1.5">
            {isManager ? tAdmin('manager') : tAdmin('admin')}
          </Badge>
        </div>
      </div>

      <div className="max-w-2xl">
        <LanguageSection />
        <ProfileIdentitySection />
      </div>

      {isManager && (
        <div className="mb-6 max-w-2xl">
          <h2 className="font-heading text-lg font-bold mb-3">{tAdmin('accessTitle')}</h2>
          <div className="fy-surface-card space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-fy-ink-soft">{tAdmin('assignedRegion')}</span>
              <span className="font-medium">{user.region || tAdmin('allRegions')}</span>
            </div>
            <div className="pt-3 border-t border-fy-muted/10">
              <p className="text-xs text-fy-ink-soft mb-2">{tAdmin('grantedPermissions')}</p>
              <div className="flex flex-wrap gap-1.5">
                {user.permissions.length === 0 ? (
                  <span className="text-sm text-fy-ink-soft">{tAdmin('noneGranted')}</span>
                ) : (
                  user.permissions.map((p) => (
                    <span key={p} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-fy-green/10 text-fy-green">
                      {p.replace(/_/g, ' ')}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 max-w-2xl">
        <h2 className="font-heading text-lg font-bold mb-3">{tAdmin('securityTitle')}</h2>
        <div className="fy-surface-card space-y-3">
          <button
            type="button"
            disabled={loggingOut}
            onClick={logoutEverywhere}
            className="flex items-center gap-2 text-sm font-semibold text-fy-brown"
          >
            <LockIcon className="w-4 h-4" /> {loggingOut ? tAdmin('signingOut') : tAdmin('logoutEverywhere')}
          </button>
          {done && <p className="text-xs text-fy-ink-soft">{tAdmin('logoutDone')}</p>}
          {error && <p className="text-xs text-fy-error">{error}</p>}
          <p className="text-xs text-fy-ink-soft pt-2 border-t border-fy-muted/10">{tAdmin('logoutNote')}</p>
        </div>
      </div>

      <div className="max-w-2xl">
        <AccountDangerZoneSection />
      </div>
    </div>
  );
}
