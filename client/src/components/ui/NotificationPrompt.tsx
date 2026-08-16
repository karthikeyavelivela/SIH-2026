'use client';

import { useState } from 'react';
import { useNotificationPermission } from '@/lib/useNotificationPermission';
import { BellIcon, XIcon } from '@/components/ui/icons';

interface NotificationPromptProps {
  accent?: 'primary' | 'secondary';
  copy?: string;
}

// Real-time-alert opt-in — explicit banner with a clear reason, not a
// silent native prompt firing on page load. Dismissible per-session
// (component unmounts on navigation, state doesn't persist to
// localStorage on purpose: re-showing next visit costs nothing and a
// user who genuinely doesn't want alerts just dismisses again).
export function NotificationPrompt({ accent = 'primary', copy = 'Get notified the instant your job status changes.' }: NotificationPromptProps) {
  const { permission, request } = useNotificationPermission();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || permission !== 'default') return null;

  const tint = accent === 'primary' ? 'bg-primary/10 text-primary-600' : 'bg-secondary/10 text-secondary-600';

  return (
    <div className={`flex items-center gap-3 rounded-lg px-4 py-3 mb-4 ${tint}`}>
      <BellIcon className="w-4 h-4 flex-shrink-0" />
      <p className="text-sm flex-1">{copy}</p>
      <button type="button" onClick={() => request()} className="text-xs font-semibold underline flex-shrink-0">
        Enable alerts
      </button>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss" className="flex-shrink-0">
        <XIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
