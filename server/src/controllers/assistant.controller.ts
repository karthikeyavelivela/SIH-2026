import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AssistantConversation, MAX_TURNS } from '../models/AssistantConversation';
import { Complaint } from '../models/Complaint';
import { Booking } from '../models/Booking';
import { User } from '../models/User';
import { askTara } from '../agents/tara';
import { writeAuditLog } from '../services/audit.service';
import { cached } from '../agents/cache';
import type { Role } from '@fyro/shared';
import type { AgentLocale } from '../agents/locale';

/**
 * TARA's HTTP surface.
 *
 * Three routes and no more: ask, read my history, fetch me a human. Every
 * one of them is scoped to req.user!.id — there is no route that takes a
 * user id, and no admin route that reads someone else's transcript.
 *
 * Nothing here performs an action on the person's behalf. `escalate` is the
 * only write beyond the transcript, it creates a Complaint, and it only
 * runs because a human pressed a button — TARA cannot call it.
 */

/** A conversation is "current" if it is the newest one and still has room. */
async function currentConversation(userId: string, role: string, locale: AgentLocale, firstQuestion: string) {
  const existing = await AssistantConversation.findOne({ userId }).sort({ updatedAt: -1 });
  if (existing && existing.messages.length < MAX_TURNS * 2 && !existing.escalatedComplaintId) {
    return existing;
  }
  return AssistantConversation.create({
    userId,
    role,
    locale,
    title: firstQuestion.slice(0, 80),
    messages: [],
  });
}

export const ask = asyncHandler(async (req: Request, res: Response) => {
  const { question, conversationId } = req.body as { question: string; conversationId?: string };
  const userId = req.user!.id;
  const role = req.user!.role as Role;

  const user = await User.findById(userId).select('preferredLocale').lean();
  const locale = (user?.preferredLocale as AgentLocale) ?? 'en';

  let conversation;
  if (conversationId) {
    // Scoped by userId as well as id — an id from the request body never
    // selects a document on its own anywhere in this file.
    conversation = await AssistantConversation.findOne({ _id: conversationId, userId });
    if (!conversation) throw new ApiError(404, 'Conversation not found');
    if (conversation.messages.length >= MAX_TURNS * 2) {
      throw new ApiError(400, 'This conversation is full — start a new one');
    }
  } else {
    conversation = await currentConversation(userId, role, locale, question);
  }

  // The agent cache keeps a repeated question off the model. Keyed by user
  // AND question, so one person's cached answer can never be served to
  // another — the key is the same discipline as the scoping above.
  const answer = await cached(`tara:${userId}:${locale}:${question}`, () => askTara(userId, role, question, locale));

  conversation.messages.push({ role: 'user', text: question, createdAt: new Date() });
  conversation.messages.push({
    role: 'assistant',
    text: answer.summary,
    evidence: answer.evidence,
    confidence: answer.confidence,
    provider: answer.provider,
    suggestedCategorySlug: answer.suggestion?.categorySlug,
    createdAt: new Date(),
  });
  await conversation.save();

  await writeAuditLog({
    actorId: userId,
    actorRole: role,
    action: 'assistant_queried',
    targetType: 'User',
    targetId: userId,
    details: {
      confidence: answer.confidence,
      mock: answer.mock,
      provider: answer.provider,
      suggestedCategory: answer.suggestion?.categorySlug,
    },
  });

  res.status(200).json({ conversationId: conversation._id.toString(), answer });
});

export const listConversations = asyncHandler(async (req: Request, res: Response) => {
  const conversations = await AssistantConversation.find({ userId: req.user!.id })
    .sort({ updatedAt: -1 })
    .limit(20)
    .select('title locale updatedAt createdAt escalatedComplaintId messages')
    .lean();

  res.status(200).json({
    conversations: conversations.map((c) => ({
      _id: c._id.toString(),
      title: c.title,
      locale: c.locale,
      updatedAt: c.updatedAt,
      messageCount: c.messages.length,
      escalated: !!c.escalatedComplaintId,
    })),
  });
});

export const getConversation = asyncHandler(async (req: Request, res: Response) => {
  const conversation = await AssistantConversation.findOne({ _id: req.params.id, userId: req.user!.id }).lean();
  if (!conversation) throw new ApiError(404, 'Conversation not found');
  res.status(200).json({ conversation });
});

/**
 * Hand the conversation to a human.
 *
 * This is the one place the assistant touches anything outside its own
 * transcript, and it exists because an assistant with no exit is a trap:
 * "I cannot help with that" has to lead somewhere. It raises a real
 * Complaint against the person's most recent booking, with the transcript
 * quoted into the description, so the support desk sees what was already
 * tried instead of starting from nothing.
 *
 * Deliberately requires a booking: Complaint.bookingId is required by the
 * model, and inventing a placeholder booking to satisfy it would put a
 * fabricated row in the grievance record. A person with no bookings is told
 * plainly to use the complaints screen instead.
 */
export const escalate = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role as Role;
  const conversation = await AssistantConversation.findOne({ _id: req.params.id, userId });
  if (!conversation) throw new ApiError(404, 'Conversation not found');
  if (conversation.escalatedComplaintId) {
    throw new ApiError(409, 'This conversation has already been passed to a human');
  }

  const booking = await Booking.findOne({
    $or: [{ customerId: userId }, { assignedDriverIds: userId }, { assignedHamaliIds: userId }],
  })
    .sort({ createdAt: -1 })
    .select('_id');

  if (!booking) {
    throw new ApiError(400, 'A complaint has to be about a booking, and there are none on your account yet');
  }

  const transcript = conversation.messages
    .map((m) => `${m.role === 'user' ? 'Asked' : 'TARA'}: ${m.text}`)
    .join('\n');

  const complaint = await Complaint.create({
    bookingId: booking._id,
    raisedByUserId: userId,
    category: 'other',
    description: `Passed to a human from a TARA conversation.\n\n${transcript}`.slice(0, 4000),
  });

  conversation.escalatedComplaintId = complaint._id;
  conversation.escalatedAt = new Date();
  await conversation.save();

  await writeAuditLog({
    actorId: userId,
    actorRole: role,
    action: 'assistant_escalated',
    targetType: 'Complaint',
    targetId: complaint._id.toString(),
    details: { conversationId: conversation._id.toString() },
  });

  res.status(201).json({ complaintId: complaint._id.toString() });
});
