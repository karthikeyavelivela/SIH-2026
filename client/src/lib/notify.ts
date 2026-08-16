// Thin wrapper around the browser Notification API — every call site
// checks permission itself via useNotificationPermission before ever
// reaching here in practice, but this guards defensively too (some
// browsers throw constructing Notification() outside a user-gesture
// context or without a service worker on mobile Safari; a missed alert is
// fine, an uncaught exception crashing the socket event handler isn't).
export function notifyUser(title: string, body: string): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, icon: '/favicon.ico', tag: title });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Best-effort — see comment above.
  }
}
