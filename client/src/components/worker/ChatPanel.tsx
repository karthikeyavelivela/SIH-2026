'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { api } from '@/lib/api';
import { ChatMsg } from '@/lib/useBookingSocket';
import { Button } from '@/components/ui/Button';

interface ChatPanelProps {
  messages: ChatMsg[];
  currentUserId: string | undefined;
  onSend: (text: string) => void;
  accent?: 'primary' | 'secondary';
}

// In-app chat scoped to a single booking room (server enforces membership —
// see realtime/handlers.ts's booking:chat_message handler). No typing
// indicators, read receipts, or attachments — spec only asks for
// "in-app chat scoped to this room".
export function ChatPanel({ messages, currentUserId, onSend, accent = 'primary' }: ChatPanelProps) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // P4.2 — "Translate" on each message, only when the server has Bhashini
  // ready. The translation is fetched on tap and kept only on this screen;
  // the original message is never replaced.
  const t = useTranslations('chatTranslate');
  const locale = useLocale();
  const [canTranslate, setCanTranslate] = useState(false);
  const [translated, setTranslated] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ ready: boolean }>('/api/chat/translate-status').then((r) => setCanTranslate(r.ready)).catch(() => setCanTranslate(false));
  }, []);

  async function translate(id: string) {
    if (translated[id] !== undefined) {
      setShown((s) => ({ ...s, [id]: !s[id] }));
      return;
    }
    setBusyId(id);
    setFailedId(null);
    try {
      const target = locale === 'te' || locale === 'hi' ? locale : 'en';
      const res = await api.post<{ text: string }>(`/api/chat/${id}/translate`, { target });
      setTranslated((s) => ({ ...s, [id]: res.text }));
      setShown((s) => ({ ...s, [id]: true }));
    } catch {
      setFailedId(id);
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText('');
  }

  const bubbleMine = accent === 'primary' ? 'bg-fy-brown text-white' : 'bg-fy-green text-white';

  return (
    <div className="rounded-card border border-fy-hairline bg-fy-card shadow-sm overflow-hidden">
      <div ref={listRef} className="max-h-64 overflow-y-auto p-4 space-y-2.5">
        {messages.length === 0 && (
          <p className="text-xs text-fy-muted text-center py-4">No messages yet — say hello.</p>
        )}
        {messages.map((m) => {
          const mine = m.senderId === currentUserId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-card px-3.5 py-2 text-sm ${mine ? bubbleMine : 'bg-fy-panel text-fy-ink'}`}>
                {!mine && <p className="text-[11px] opacity-70 mb-0.5">{m.senderName ?? m.senderRole}</p>}
                <p>{shown[m.id] && translated[m.id] !== undefined ? translated[m.id] : m.text}</p>
                {canTranslate && (
                  <button type="button" onClick={() => void translate(m.id)} disabled={busyId === m.id} className="mt-1 text-[11px] underline opacity-80 disabled:opacity-50">
                    {busyId === m.id ? t('translating') : shown[m.id] ? t('showOriginal') : t('translate')}
                  </button>
                )}
                {failedId === m.id && <p className="text-[11px] opacity-80">{t('failed')}</p>}
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-fy-hairline p-3">
        <input
          id="booking-chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message…"
          aria-label="Chat message"
          className="flex-1 min-h-[40px] px-3.5 py-2 rounded-full border border-fy-hairline bg-fy-bone text-sm focus:border-fy-brown focus:ring-2 focus:ring-fy-brown/20 transition-colors duration-fast"
        />
        <Button type="submit" size="md" variant={accent === 'primary' ? 'primary' : 'secondary'} disabled={!text.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
