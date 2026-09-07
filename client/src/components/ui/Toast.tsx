'use client';

import { createContext, useCallback, useContext, useState, ReactNode } from 'react';

interface ToastItem {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'neutral';
}

interface ToastContextValue {
  show: (message: string, tone?: ToastItem['tone']) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const toneClass: Record<ToastItem['tone'], string> = {
  success: 'bg-fyro-ink text-fyro-bone border-l-4 border-accent-labour',
  error: 'bg-fyro-ink text-fyro-bone border-l-4 border-red-400',
  neutral: 'bg-fyro-ink text-fyro-bone border-l-4 border-accent-transport',
};

// Ephemeral confirmation strip — "saved", "copied invite code", "reported"
// — the fyro-elevated glass treatment, auto-dismiss after 3.5s. Mount
// <ToastProvider> once near the root; call useToast().show(...) anywhere.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, tone: ToastItem['tone'] = 'neutral') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto px-4 py-3 rounded-control font-body text-body-default shadow-lg animate-[fadeUp_0.2s_ease-out] ${toneClass[t.tone]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
