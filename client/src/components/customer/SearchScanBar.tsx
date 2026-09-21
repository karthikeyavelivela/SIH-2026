'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/Icon';
import { openGlobalSearch } from '@/components/ui/GlobalSearch';
import type { CustomerMode } from '@/lib/customerMode';

/**
 * One field, two completely different actions.
 *
 * Tapping the field opens text search. Tapping the camera opens Scan and
 * Diagnose — photographing a problem and letting TARA say which trade it
 * belongs to. They share a row because they answer the same question
 * ("what do I need?") from opposite ends, but the camera is emphatically
 * not "search by image": it is a diagnosis flow that ends in a booking or
 * in advice to try something yourself.
 *
 * So the camera is a separate button with its own label and its own hit
 * area, divided by a rule — not an affordance tucked inside the input that
 * a person might tap expecting the keyboard.
 */
export function SearchScanBar({
  mode,
  /**
   * Scan and Diagnose is Household-only for now. Its prompt names household
   * trades, so a photograph of damaged cargo taken in Transit would come
   * back as a carpenter. Rather than show a control that answers the wrong
   * question, the other two modes get search alone.
   */
  showScan = mode === 'household',
}: {
  mode: CustomerMode;
  showScan?: boolean;
}) {
  const t = useTranslations('customerHome');
  const router = useRouter();

  return (
    <div className="flex items-center gap-1.5 rounded-control bg-fy-card border border-fy-hairline/50 shadow-card pl-3.5 pr-1.5 py-1.5">
      <Icon name="search" size={18} className="text-fy-muted shrink-0" />
      <button
        type="button"
        onClick={openGlobalSearch}
        className="flex-1 min-w-0 text-left min-h-[40px] font-body text-body text-fy-muted truncate"
      >
        {t(`searchPlaceholder.${mode}` as never)}
      </button>

      {showScan && (
        <>
          <span aria-hidden className="w-px self-stretch my-2 bg-fy-hairline/60" />
          <button
            type="button"
            onClick={() => router.push('/customer/scan')}
            aria-label={t('scanAria')}
            className="shrink-0 w-10 h-10 rounded-control bg-fy-lime-tint-2 text-fy-green flex items-center justify-center transition-transform active:scale-95"
          >
            <Icon name="photo_camera" size={20} />
          </button>
        </>
      )}
    </div>
  );
}
