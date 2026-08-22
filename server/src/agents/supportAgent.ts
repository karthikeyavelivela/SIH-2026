import { Booking } from '../models/Booking';
import { Complaint } from '../models/Complaint';
import { InsurancePolicy } from '../models/InsurancePolicy';
import { User } from '../models/User';
import { callAgent } from './client';
import { AgentResult } from './types';
import type { Role } from '@fyro/shared';

/**
 * Agent A — Support Agent. Answers from the CALLER's own records only —
 * every query below is scoped to req.user!.id server-side (see
 * agents.controller.ts), identical IDOR discipline to every other
 * "my data" route in this codebase. Never fetches or reasons about
 * anyone else's data, and the system prompt explicitly forbids answering
 * about anything not present in the supplied context.
 */
export async function runSupportAgent(userId: string, role: Role, question: string): Promise<AgentResult> {
  const [bookings, complaints, policies, user] = await Promise.all([
    Booking.find({
      $or: [{ customerId: userId }, { assignedDriverIds: userId }, { assignedHamaliIds: userId }],
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    Complaint.find({ raisedByUserId: userId }).sort({ createdAt: -1 }).limit(5).lean(),
    InsurancePolicy.find({ userId }).lean(),
    User.findById(userId).select('kycStatus kycDocs name role').lean(),
  ]);

  const context = {
    role,
    recentBookings: bookings.map((b) => ({
      id: b._id.toString(),
      type: b.type,
      status: b.status,
      fareTotal: b.fareBreakdown?.total,
      pickup: b.pickupLocation?.address,
      drop: b.dropLocation?.address,
      createdAt: b.createdAt,
    })),
    complaints: complaints.map((c) => ({ category: c.category, status: c.status, createdAt: c.createdAt })),
    insurancePolicies: policies.map((p) => ({ status: p.status, endDate: p.endDate })),
    kycStatus: user?.kycStatus,
    kycDocumentsOutstanding: (user?.kycDocs ?? []).filter((d) => d.status !== 'verified').length,
  };

  const systemPrompt = `You are FYRO's support agent for a logistics marketplace in Andhra Pradesh, India.
Answer ONLY using the JSON context the user message provides — it is that person's own real account data (bookings, complaints, insurance, KYC).
Never invent a booking, fare, status, or date that is not literally present in the context. If the answer isn't in the context, say so plainly and recommend escalating to a human — do not guess.
Respond ONLY with JSON: {"summary": "<direct answer, plain language>", "confidence": "low"|"moderate"|"high", "evidence": [{"label": "<field name>", "value": "<the actual value from context>"}]}.
confidence "high" only when the context directly answers the question. "low" when you had to say you don't know or recommend escalation.`;

  const userPrompt = `Question: "${question}"\n\nContext:\n${JSON.stringify(context, null, 2)}`;

  return callAgent(
    { agentName: 'support', systemPrompt, userPrompt, context },
    (ctx) => {
      const c = ctx as typeof context;
      if (c.recentBookings.length === 0) {
        return {
          summary: "You don't have any bookings on record yet — nothing to report on. If you think this is wrong, escalate to a human.",
          confidence: 'low',
          evidence: [],
        };
      }
      const latest = c.recentBookings[0];
      return {
        summary: `Your most recent ${latest.type} booking is currently "${latest.status}". Fare: ₹${latest.fareTotal ?? '—'}.`,
        confidence: 'moderate',
        evidence: [
          { label: 'Booking status', value: latest.status },
          { label: 'Fare', value: `₹${latest.fareTotal ?? '—'}` },
          { label: 'Route', value: `${latest.pickup ?? '—'} → ${latest.drop ?? '—'}` },
        ],
      };
    }
  );
}
