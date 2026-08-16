'use client';

import { useCallback, useEffect, useState } from 'react';

// Explicit opt-in only — request() is only ever called from a click
// handler (the NotificationPrompt banner's button), never on mount. A
// silent auto-prompt on page load is exactly the pattern browsers now
// suppress/penalize and users distrust.
export function useNotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission);
  }, []);

  const request = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }, []);

  return { permission, request };
}
