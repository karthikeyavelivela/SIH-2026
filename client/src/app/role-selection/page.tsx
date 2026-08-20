'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { UserIcon, TruckIcon, BoxIcon, LayersIcon, MapPinIcon, ChevronRightIcon, ChevronLeftIcon } from '@/components/ui/icons';

// "Who are you?" chooser (design/stitch/.../role_selection). Routes straight
// into the matching signup flow on tap — roleHome (client/src/lib/roleHome.ts)
// already defines where each role lands post-auth, this is the mirror of
// that on the way IN. fleet-owner/warehouse-hub signup pages are owned by a
// different concurrent task (see HARD BOUNDARIES) — linking to them here is
// safe even before they exist since Next.js only 404s at request time.
const ROLES = [
  { key: 'customer', href: '/signup/customer', icon: UserIcon, tone: 'primary' },
  { key: 'driver', href: '/signup/driver', icon: TruckIcon, tone: 'primary' },
  { key: 'hamali', href: '/signup/hamali', icon: BoxIcon, tone: 'secondary' },
  { key: 'fleetOwner', href: '/signup/fleet-owner', icon: LayersIcon, tone: 'primary' },
  { key: 'warehouseHub', href: '/signup/warehouse-hub', icon: MapPinIcon, tone: 'secondary' },
] as const;

export default function RoleSelectionPage() {
  const t = useTranslations('shared.roleSelection');

  return (
    <div className="min-h-screen bg-background px-6 py-10 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-24 w-80 h-80 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="max-w-lg mx-auto relative z-10">
        <div className="flex items-center justify-between mb-10">
          <Link
            href="/language-selection"
            aria-label={t('backToHome')}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-raised border border-border shadow-sm hover:bg-surface transition-colors duration-fast"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </Link>
          <span className="font-heading text-lg font-extrabold text-primary-600 tracking-tight">FYRO</span>
        </div>

        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-text-primary mb-3">{t('title')}</h1>
        <p className="text-text-muted mb-8">{t('subtitle')}</p>

        <div className="space-y-3">
          {ROLES.map((r) => (
            <Link
              key={r.key}
              href={r.href}
              className="group flex items-center gap-4 rounded-lg border border-border bg-surface-raised p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-base ease-out-expo"
            >
              <span
                className={`flex-shrink-0 flex h-12 w-12 items-center justify-center rounded-full ${
                  r.tone === 'primary' ? 'bg-primary/10 text-primary-600' : 'bg-secondary/10 text-secondary-600'
                }`}
              >
                <r.icon className="w-6 h-6" />
              </span>
              <div className="flex-1 min-w-0">
                <h2 className="font-heading font-bold text-text-primary">{t(`roles.${r.key}.title`)}</h2>
                <p className="text-sm text-text-muted leading-snug mt-0.5">{t(`roles.${r.key}.body`)}</p>
              </div>
              <ChevronRightIcon className="w-5 h-5 text-text-muted flex-shrink-0 transition-transform duration-base group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
