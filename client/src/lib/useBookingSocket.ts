'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from './socket';
import { BookingStatus, STATUS_LABEL } from './types';
import { notifyUser } from './notify';

export interface ChatMsg {
  id: string;
  senderId: string;
  senderRole: string;
  senderName?: string;
  text: string;
  createdAt: string;
}

export interface LiveLocation {
  lat: number;
  lng: number;
  at: number;
}

export interface MatchedInfo {
  assigned: Record<string, unknown>;
}

/**
 * Joins booking:{id} on mount (server re-verifies membership — see
 * realtime/rooms.ts — a caller with no real relationship to the booking
 * just gets `joined:false` back and hears nothing), leaves on unmount.
 * Layers on top of each page's own REST fetch/poll rather than replacing
 * it — a page that never receives a single realtime event still works off
 * its poll, it just doesn't feel instant.
 */
export function useBookingSocket(bookingId: string | undefined) {
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState<BookingStatus | null>(null);
  const [matched, setMatched] = useState<MatchedInfo | null>(null);
  const [liveLocation, setLiveLocation] = useState<LiveLocation | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const socketRef = useRef(getSocket());

  useEffect(() => {
    if (!bookingId) return;
    const socket = socketRef.current;

    function onStatus(payload: { bookingId: string; status: BookingStatus }) {
      if (payload.bookingId === bookingId) {
        setStatus(payload.status);
        if (payload.status === 'in_progress' || payload.status === 'completed') {
          notifyUser('FYRO', `Your booking is now ${STATUS_LABEL[payload.status].toLowerCase()}.`);
        }
      }
    }
    function onMatched(payload: { bookingId: string; status: BookingStatus; assigned: Record<string, unknown> }) {
      if (payload.bookingId === bookingId) {
        setStatus(payload.status);
        setMatched({ assigned: payload.assigned });
        notifyUser('FYRO', "You're matched — someone's on the way.");
      }
    }
    function onLocation(payload: { bookingId: string; lat: number; lng: number; at: number }) {
      if (payload.bookingId === bookingId) setLiveLocation({ lat: payload.lat, lng: payload.lng, at: payload.at });
    }
    function onChatMessage(payload: ChatMsg & { bookingId: string }) {
      if (payload.bookingId === bookingId) setMessages((prev) => [...prev, payload]);
    }
    function onChatHistory(payload: { bookingId: string; messages: ChatMsg[] }) {
      if (payload.bookingId === bookingId) setMessages(payload.messages);
    }

    socket.on('booking:status', onStatus);
    socket.on('booking:matched', onMatched);
    socket.on('booking:location_update', onLocation);
    socket.on('booking:chat_message', onChatMessage);
    socket.on('booking:chat_history', onChatHistory);

    socket.emit('booking:join', { bookingId }, (ack: { ok: boolean }) => setJoined(!!ack?.ok));

    return () => {
      socket.emit('booking:leave', { bookingId });
      socket.off('booking:status', onStatus);
      socket.off('booking:matched', onMatched);
      socket.off('booking:location_update', onLocation);
      socket.off('booking:chat_message', onChatMessage);
      socket.off('booking:chat_history', onChatHistory);
    };
  }, [bookingId]);

  const sendChat = useCallback(
    (text: string) => {
      if (!bookingId || !text.trim()) return;
      socketRef.current.emit('booking:chat_message', { bookingId, text: text.trim() });
    },
    [bookingId]
  );

  const sendLocation = useCallback(
    (lat: number, lng: number) => {
      if (!bookingId) return;
      socketRef.current.emit('booking:location', { bookingId, lat, lng });
    },
    [bookingId]
  );

  return { joined, status, matched, liveLocation, messages, sendChat, sendLocation };
}
