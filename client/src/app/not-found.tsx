import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';
import { CompassIcon } from '@/components/ui/icons';

// A route that doesn't exist previously fell through to Next.js's default,
// unbranded "404 | This page could not be found" screen. Server component
// (not 'use client') since it has no interactive reset — reads locale via
// next-intl/server the same way the root layout does.
export default async function NotFound() {
  const t = await getTranslations('errorBoundary');
  return (
    <div className="max-w-lg mx-auto px-5 pt-6 min-h-screen flex items-center">
      <EmptyState
        icon={<CompassIcon className="w-7 h-7" />}
        title={t('notFoundTitle')}
        description={t('notFoundDescription')}
        action={
          <Link href="/" className="text-sm font-semibold text-ip-primary hover:underline">
            {t('goToHomepage')}
          </Link>
        }
      />
    </div>
  );
}
