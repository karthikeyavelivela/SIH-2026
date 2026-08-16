'use client';

import { useEffect, useRef, useState } from 'react';
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

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText('');
  }

  const bubbleMine = accent === 'primary' ? 'bg-primary-600 text-white' : 'bg-secondary-600 text-white';

  return (
    <div className="rounded-lg border border-border bg-surface-raised shadow-sm overflow-hidden">
      <div ref={listRef} className="max-h-64 overflow-y-auto p-4 space-y-2.5">
        {messages.length === 0 && (
          <p className="text-xs text-text-muted text-center py-4">No messages yet — say hello.</p>
        )}
        {messages.map((m) => {
          const mine = m.senderId === currentUserId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-lg px-3.5 py-2 text-sm ${mine ? bubbleMine : 'bg-surface text-text-primary'}`}>
                {!mine && <p className="text-[11px] opacity-70 mb-0.5">{m.senderName ?? m.senderRole}</p>}
                <p>{m.text}</p>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border p-3">
        <input
          id="booking-chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message…"
          aria-label="Chat message"
          className="flex-1 min-h-[40px] px-3.5 py-2 rounded-full border border-border bg-background text-sm focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20 transition-colors duration-fast"
        />
        <Button type="submit" size="md" variant={accent === 'primary' ? 'primary' : 'secondary'} disabled={!text.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
