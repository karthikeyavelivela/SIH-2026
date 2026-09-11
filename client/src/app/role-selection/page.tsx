'use client';

import { useTranslations } from 'next-intl';
import { OnboardingShell, OptionRow } from '@/components/auth/OnboardingShell';

// "Who are you?" chooser (design/stitch/.../role_selection). Routes straight
// into the matching signup flow on tap — roleHome (client/src/lib/roleHome.ts)
// already defines where each role lands post-auth, this is the mirror of
// that on the way IN.
const ROLES = [
  { key: 'customer', href: '/signup/customer', glyph: 'person' },
  { key: 'driver', href: '/signup/driver', glyph: 'local_shipping' },
  { key: 'hamali', href: '/signup/hamali', glyph: 'engineering' },
  { key: 'fleetOwner', href: '/signup/fleet-owner', glyph: 'inventory' },
  { key: 'warehouseHub', href: '/signup/warehouse-hub', glyph: 'warehouse' },
] as const;

export default function RoleSelectionPage() {
  const t = useTranslations('shared.roleSelection');
  const tf = useTranslations('shared.onboarding');

  return (
    <OnboardingShell
      backHref="/language-selection"
      backLabel={t('backToHome')}
      step="02 / 03"
      eyebrow={tf('flowEyebrow')}
      title={t('title')}
      lede={t('subtitle')}
    >
      <div className="flex flex-col gap-3">
        {ROLES.map((r) => (
          <OptionRow
            key={r.key}
            href={r.href}
            glyph={r.glyph}
            title={t(`roles.${r.key}.title`)}
            body={t(`roles.${r.key}.body`)}
          />
        ))}
      </div>
    </OnboardingShell>
  );
}
