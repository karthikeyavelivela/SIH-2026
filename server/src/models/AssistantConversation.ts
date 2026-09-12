import { Schema, model, Types } from 'mongoose';

/**
 * A TARA conversation.
 *
 * One document per user per conversation, messages embedded. Embedded
 * rather than a separate collection because a conversation is only ever
 * read whole, by exactly one person, and is bounded: MAX_TURNS below caps
 * it, and a conversation that fills up starts a new one rather than growing
 * without limit.
 *
 * `userId` is the ownership boundary and every query in
 * assistant.controller.ts filters on it. There is deliberately no admin
 * "read anyone's conversation" route: TARA answers from a person's own
 * records, so their conversation history can quote their own fares,
 * addresses and KYC state back at them, and an assistant transcript is not
 * something the support desk needs in order to help.
 */

export type AssistantRole = 'user' | 'assistant';

export interface IAssistantMessage {
  role: AssistantRole;
  text: string;
  /** Present on assistant turns — the same evidence the AgentResult carried, so history shows WHY, not just what. */
  evidence?: { label: string; value: string }[];
  confidence?: 'low' | 'moderate' | 'high';
  /** Which model answered, or absent for the rule-based path. Kept per message because the chain can change between turns. */
  provider?: string;
  /** A service category TARA matched from the user's own words, if any. */
  suggestedCategorySlug?: string;
  createdAt: Date;
}

export interface IAssistantConversation {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /** The role the user held when the conversation happened — what TARA scoped its answers to. Stored so an old transcript is readable even if the person's role later changes. */
  role: string;
  locale: 'en' | 'te' | 'hi';
  /** First question, trimmed — what the history list shows. */
  title: string;
  messages: IAssistantMessage[];
  /** Set when the person asked for a human. Points at the Complaint that was raised, so the transcript and the grievance are linked both ways. */
  escalatedComplaintId?: Types.ObjectId;
  escalatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** A conversation past this many turns starts a new one. Keeps the document small and the prompt context bounded. */
export const MAX_TURNS = 40;

const messageSchema = new Schema<IAssistantMessage>(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, required: true },
    evidence: [{ label: String, value: String, _id: false }],
    confidence: { type: String, enum: ['low', 'moderate', 'high'] },
    provider: { type: String },
    suggestedCategorySlug: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const conversationSchema = new Schema<IAssistantConversation>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, required: true },
    locale: { type: String, enum: ['en', 'te', 'hi'], default: 'en' },
    title: { type: String, required: true },
    messages: { type: [messageSchema], default: [] },
    escalatedComplaintId: { type: Schema.Types.ObjectId, ref: 'Complaint' },
    escalatedAt: { type: Date },
  },
  { timestamps: true }
);

// History is always "mine, newest first".
conversationSchema.index({ userId: 1, updatedAt: -1 });

export const AssistantConversation = model<IAssistantConversation>('AssistantConversation', conversationSchema);
