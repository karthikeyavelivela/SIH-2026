'use client';

import { ReactNode, useEffect, useRef } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

// Next consumer (Task 17) uses this to gate destructive admin actions
// (suspend/delete an account), so keyboard/screen-reader support here isn't
// just polish — a stuck-open confirm dialog with no ESC/focus handling is a
// real usability and safety gap, not a cosmetic one.
export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = 'modal-title';

  useEffect(() => {
    if (!open) return;

    // Move focus into the dialog and lock body scroll while it's open.
    closeButtonRef.current?.focus();
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-background rounded-2xl w-full max-w-md p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 id={titleId} className="font-heading text-lg font-semibold">
            {title}
          </h3>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="text-text-muted hover:text-text-primary"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="mb-6">{children}</div>
        {footer && <div className="flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}
