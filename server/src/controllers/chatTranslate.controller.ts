import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ChatMessage } from '../models/ChatMessage';
import { Booking } from '../models/Booking';
import { canJoinBookingRoom } from '../realtime/rooms';
import { translateText, bhashiniReady, bhashiniStatus, type BhashiniLang } from '../services/bhashini.service';
import type { Role } from '@fyro/shared';

/** Which of the three languages a message is written in, from its script. Latin text is treated as English. */
export function detectLanguage(text: string): BhashiniLang {
  const telugu = (text.match(/[ఀ-౿]/g) ?? []).length;
  const devanagari = (text.match(/[ऀ-ॿ]/g) ?? []).length;
  if (telugu === 0 && devanagari === 0) return 'en';
  return telugu >= devanagari ? 'te' : 'hi';
}

/** GET /api/chat/translate-status: lets the chat show a Translate link only when it can work. */
export const translateStatus = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json(bhashiniStatus());
});

/**
 * POST /api/chat/:messageId/translate — translate one booking chat message on
 * request. Only someone who can be in that booking's chat may translate its
 * messages; nothing is stored, and the original is never changed.
 */
export const translateChatMessage = asyncHandler(async (req: Request, res: Response) => {
  const { target } = req.body as { target: BhashiniLang };
  if (!bhashiniReady()) throw new ApiError(503, 'Translation is not switched on yet.');

  const message = await ChatMessage.findById(req.params.messageId).lean();
  if (!message) throw new ApiError(404, 'Message not found');
  const booking = await Booking.findById(message.bookingId);
  if (!booking || !(await canJoinBookingRoom({ id: req.user!.id, role: req.user!.role as Role }, booking))) {
    // Same answer as a message that does not exist: a stranger learns nothing.
    throw new ApiError(404, 'Message not found');
  }

  const source = detectLanguage(message.text);
  if (source === target) return void res.status(200).json({ text: message.text, source, target, translated: false });

  const out = await translateText(message.text, source, target);
  if (!out.ok) throw new ApiError(502, 'Translation did not work just now. Please try again in a moment.');
  res.status(200).json({ text: out.data, source, target, translated: true });
});
