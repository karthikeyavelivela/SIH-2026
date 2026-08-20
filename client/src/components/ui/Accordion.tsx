'use client';

import { ReactNode, useState } from 'react';

interface AccordionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

// Single collapsible section — FAQ entries, itemized manifest details,
// admin export options. For a group of mutually-exclusive sections, render
// several with independent `defaultOpen` (no shared coordinator needed —
// FYRO's FAQ/manifest use cases don't require close-others behavior).
export function Accordion({ title, children, defaultOpen = false, className = '' }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 py-ip-sm text-left"
      >
        <span className="font-heading font-bold text-sm text-ip-on-surface">{title}</span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`flex-shrink-0 text-ip-on-surface-variant transition-transform duration-fast ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && <div className="pb-ip-sm text-sm text-ip-on-surface-variant">{children}</div>}
    </div>
  );
}
