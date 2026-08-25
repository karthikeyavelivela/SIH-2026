'use client';

import { ReactNode, useEffect, useRef } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = 'modal-title';

  // `onClose` is a new function identity on every render for any caller
  // passing an inline arrow (e.g. RatingModal's `onClose={() => {}}`) — and
  // a caller with its own state (the comment textarea) re-renders on every
  // keystroke. With `onClose` in this effect's own deps, that identity
  // change re-ran the effect after every character typed, which called
  // closeButtonRef.current?.focus() again and yanked focus off whatever
  // the user was actually typing into, back to the × button. Routing
  // through a ref keeps the escape handler always calling the LATEST
  // onClose without needing it in the deps array below — the effect (and
  // the focus-steal) now only runs when `open` itself actually changes.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/50 backdrop-blur-sm px-4 animate-[fadeIn_150ms_ease-out]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-surface-raised rounded-lg w-full max-w-md p-7 shadow-lg animate-[scaleIn_200ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 id={titleId} className="font-heading text-lg font-bold">
            {title}
          </h3>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:bg-surface hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="mb-7">{children}</div>
        {footer && <div className="flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}
