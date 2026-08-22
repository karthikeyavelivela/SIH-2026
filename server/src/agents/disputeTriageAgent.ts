import { Dispute } from '../models/Dispute';
import { Booking } from '../models/Booking';
import { ChatMessage } from '../models/ChatMessage';
import { ApiError } from '../utils/ApiError';
import { callAgent } from './client';
import { AgentResult } from './types';
import type { AgentLocale } from './locale';

/**
 * Agent B — Dispute Triage. Assembles the real evidence packet (chat log,
 * pickup/delivery proof photos, status-transition timestamps, fare
 * breakdown) for one dispute, presents claim vs system record, and
 * recommends an outcome that acknowledges evidence on both sides — never
 * a one-sided verdict. An admin still clicks resolveDispute (unchanged,
 * dispute.controller.ts) to actually act; this only informs that click.
 */
export async function runDisputeTriageAgent(disputeId: string, adminLocale?: AgentLocale): Promise<AgentResult> {
  const dispute = await Dispute.findById(disputeId).populate('raisedBy', 'name role');
  if (!dispute) throw new ApiError(404, 'Dispute not found');

  const booking = await Booking.findById(dispute.bookingId).lean();
  const messages = await ChatMessage.find({ bookingId: dispute.bookingId }).sort({ createdAt: 1 }).limit(50).lean();

  const context = {
    claim: dispute.claim,
    systemRecord: dispute.systemRecord,
    statusTimestamps: dispute.systemRecord.statusHistory.map((h) => ({ status: h.status, at: h.timestamp })),
    proofPhotos: {
      pickup: booking?.proofPhotos?.pickup ? 'present' : 'missing',
      delivery: booking?.proofPhotos?.delivery ? 'present' : 'missing',
    },
    chatMessageCount: messages.length,
    chatExcerpt: messages.slice(-10).map((m) => ({ from: m.senderRole, text: m.text })),
  };

  const systemPrompt = `You are FYRO's dispute triage agent for a logistics marketplace. You are given one customer/worker's CLAIM alongside the SYSTEM'S OWN RECORD of what actually happened (status timestamps, proof photos, chat log).
Compare them. Acknowledge what supports the claim AND what supports the system record — never a one-sided verdict. Recommend one action: "approve_adjustment", "partial_refund", "reject", or "escalate" (use escalate when evidence is genuinely insufficient or contradictory).
Never fabricate evidence not present in the context — if proof photos are "missing", say that plainly, don't assume what they would have shown.
Respond ONLY with JSON: {"summary": "<recommendation + one-sentence reasoning citing both sides>", "confidence": "low"|"moderate"|"high", "evidence": [{"label": "<what>", "value": "<from context>"}]}.`;

  const userPrompt = `Dispute claim: "${context.claim}"\n\nEvidence packet:\n${JSON.stringify(context, null, 2)}`;

  return callAgent(
    { agentName: 'dispute_triage', systemPrompt, userPrompt, context, locale: adminLocale },
    (ctx) => {
      const c = ctx as typeof context;
      const hasBothPhotos = c.proofPhotos.pickup === 'present' && c.proofPhotos.delivery === 'present';
      return {
        summary: hasBothPhotos
          ? 'Both pickup and delivery proof photos exist and the status history is complete — the system record is well-documented. Recommend reviewing the claim against these before deciding.'
          : 'Proof photo coverage is incomplete for this booking — recommend escalating for manual review rather than deciding on partial evidence.',
        confidence: hasBothPhotos ? 'moderate' : 'low',
        evidence: [
          { label: 'Pickup photo', value: c.proofPhotos.pickup },
          { label: 'Delivery photo', value: c.proofPhotos.delivery },
          { label: 'Chat messages', value: String(c.chatMessageCount) },
          { label: 'System status', value: c.systemRecord.status },
        ],
      };
    }
  );
}
