'use client';

import { ReactNode, useEffect } from 'react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}

// Full-width sheet anchored to the bottom of the viewport — per DESIGN.md,
// "full-screen or bottom-sheet overlay with a soft backdrop blur (10px)",
// used for filters, bid entry, quick actions. Distinct from Modal (centered,
// max-w-md) which stays reserved for confirm/cancel dialogs.
export function BottomSheet({ open, onClose, title, children, footer }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ip-inverse-surface/40 backdrop-blur-[10px] animate-[fadeIn_150ms_ease-out]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg bg-ip-surface-container-lowest rounded-t-ip-sheet px-ip-edge pt-3 pb-8 max-h-[85vh] overflow-y-auto animate-[fadeUp_250ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-ip-outline-variant" aria-hidden="true" />
        {title && <h2 className="font-heading font-bold text-ip-headline-sm mb-4">{title}</h2>}
        {children}
        {footer && <div className="mt-6">{footer}</div>}
      </div>
    </div>
  );
}
