'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeftIcon } from '@/components/ui/icons';

interface BackHeaderProps {
  title: string;
  /** Falls back to router.back() when omitted — use an explicit href when a page can be reached without page-history (e.g. deep link, new tab). */
  fallbackHref?: string;
}

// Every detail/sub-screen not itself a bottom-tab destination gets this —
// the bottom tab bar alone isn't a way "back" to whatever screen led here
// (a request list, a history list, a notification).
export function BackHeader({ title, fallbackHref }: BackHeaderProps) {
  const router = useRouter();

  function handleBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else if (fallbackHref) {
      router.push(fallbackHref);
    } else {
      router.back();
    }
  }

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 px-5 py-4 bg-background/90 backdrop-blur-md border-b border-border">
      <button
        type="button"
        onClick={handleBack}
        aria-label="Go back"
        className="w-9 h-9 -ml-1.5 flex items-center justify-center rounded-full text-text-primary hover:bg-surface transition-colors duration-fast"
      >
        <ChevronLeftIcon className="w-5 h-5" />
      </button>
      <h1 className="font-heading text-lg font-bold truncate">{title}</h1>
    </div>
  );
}
