import { callAgent } from '../client';
import { AgentResult } from '../types';
import type { AgentLocale } from '../locale';
import type { Role } from '@fyro/shared';
import { buildTaraContext, TaraContext } from './context';
import { diagnoseCategory, bookingPathFor } from './symptoms';

/**
 * TARA — one assistant, every role.
 *
 * Before this, "AI help" was a different widget per screen with a different
 * name and a different scope, and a worker who found it on their dashboard
 * had no reason to expect the same thing existed on the customer side. TARA
 * is the single one: same name, same entry point, same guardrails, with the
 * answer scoped to whatever the asker's role actually gives them.
 *
 * What TARA may do: read the asker's own records (context.ts is the whole
 * boundary), answer from them, point at a booking screen when the person
 * described a problem rather than a question, and offer to fetch a human.
 *
 * What TARA may never do: anything consequential. It does not book, cancel,
 * accept, pay, refund, approve KYC, change a fare, assign a worker, or
 * resolve a complaint. Not "is discouraged from" — there is no code path
 * from this module to any of those operations. The only write anywhere in
 * the assistant is the conversation transcript itself, plus the complaint
 * that a person explicitly asks for by pressing escalate.
 */

export interface TaraAnswer extends AgentResult {
  /** Set when the person described a symptom that maps to a bookable trade. */
  suggestion?: {
    categorySlug: string;
    path: string;
    matchedTerms: string[];
  };
  /** True when TARA could not answer from the person's own records and a human should take over. */
  recommendEscalation: boolean;
}

const ROLE_FRAMING: Record<string, string> = {
  customer: 'The person asking is a CUSTOMER. They care about their bookings, fares, refunds, tracking, complaints and how to book the right service.',
  driver: 'The person asking is a DRIVER. They care about their jobs, earnings and deductions, their vehicle compliance, KYC documents and insurance.',
  hamali_solo: 'The person asking is a SOLO HAMALI (a loading/unloading worker). They care about job offers, earnings and deductions, their skills profile and insurance.',
  mutha_member: 'The person asking is a MEMBER of a cooperative society. They care about the jobs their society assigns them, their take-home pay after society and platform deductions, and their share in the society.',
  mutha_leader: 'The person asking is the LEADER of a cooperative society. They care about assigning members to jobs, the society bye-law rates, surplus distribution and their members’ welfare fund.',
  fleet_owner: 'The person asking is a FLEET OWNER. They care about their vehicles, compliance and maintenance.',
  warehouse_hub: 'The person asking runs a WAREHOUSE HUB. They care about dock slots and inbound loads.',
  manager: 'The person asking is a MANAGER with a scoped operations view.',
  admin: 'The person asking is an ADMIN.',
  federation_state: 'The person asking administers a STATE cooperative federation.',
  federation_district: 'The person asking administers a DISTRICT cooperative federation.',
};

/** Phrases that mean "TARA could not help" — used to decide whether to offer a human. */
function looksUnanswered(summary: string, confidence: string): boolean {
  return confidence === 'low' || /don't know|do not know|not in your records|no record|escalat/i.test(summary);
}

export async function askTara(
  userId: string,
  role: Role,
  question: string,
  locale: AgentLocale
): Promise<TaraAnswer> {
  const context = await buildTaraContext(userId, role);
  const symptom = diagnoseCategory(question);

  const systemPrompt = `You are TARA, the assistant inside FYRO — a cooperative-owned household services and logistics marketplace in India. Your name is TARA and you refer to yourself as TARA.
${ROLE_FRAMING[role] ?? 'The person asking is a FYRO user.'}

Answer ONLY using the JSON context in the user message. It is that person's own real account data and nothing else — no other user's records exist for you.
NEVER invent a booking, fare, status, date, name or amount that is not literally in the context. If the answer is not there, say so plainly in one sentence and say a human colleague can take it from here — do not guess, and do not speculate about what might be true.
If the person asks about someone else's account, or asks you to do something to another person's data, tell them plainly that you can only see their own records.
You cannot DO anything: you cannot book, cancel, accept, pay, refund, approve a document, change a fare, assign a worker or close a complaint. If asked to, explain in one sentence which screen does it and that they have to do it themselves.
Be brief. Two or three sentences at most, in plain everyday language — many readers are not highly literate.

Respond ONLY with JSON: {"summary": "<your answer>", "confidence": "low"|"moderate"|"high", "evidence": [{"label": "<what field this came from>", "value": "<the actual value from the context>"}]}.
Use confidence "high" only when the context directly answers the question, and "low" whenever you had to say you do not know.`;

  const userPrompt = `Question: "${question}"\n\nContext:\n${JSON.stringify(context, null, 2)}`;

  const result = await callAgent({ agentName: 'tara', systemPrompt, userPrompt, context: context as unknown as Record<string, unknown>, locale }, (ctx) =>
    ruleBasedAnswer(ctx as unknown as TaraContext, symptom, locale)
  );

  return {
    ...result,
    suggestion: symptom
      ? { categorySlug: symptom.slug, path: bookingPathFor(symptom.slug), matchedTerms: symptom.matched }
      : undefined,
    recommendEscalation: looksUnanswered(result.summary, result.confidence),
  };
}

/**
 * The answer when no model is configured, or when every provider failed.
 *
 * It is deliberately not a "sorry, AI unavailable" message: the symptom
 * match and the person's own latest booking are both real, locally computed
 * facts, and they are the two things most questions are actually about. A
 * degraded TARA still routes someone to the right trade.
 */
function ruleBasedAnswer(
  ctx: TaraContext,
  symptom: { slug: string; matched: string[] } | null,
  locale: AgentLocale
): Pick<AgentResult, 'summary' | 'confidence' | 'evidence'> {
  if (symptom) {
    const summary: Record<AgentLocale, string> = {
      en: `That sounds like a job for a ${symptom.slug.replace(/_/g, ' ')}. You can book one from the booking screen — I can point you there, but you place the booking yourself.`,
      te: `ఇది ${symptom.slug.replace(/_/g, ' ')} పనిలా ఉంది. బుకింగ్ స్క్రీన్ నుండి బుక్ చేసుకోవచ్చు — నేను దారి చూపుతాను, బుకింగ్ మీరే చేయాలి.`,
      hi: `यह ${symptom.slug.replace(/_/g, ' ')} का काम लगता है। आप बुकिंग स्क्रीन से बुक कर सकते हैं — मैं रास्ता दिखा सकती हूँ, बुकिंग आपको खुद करनी होगी।`,
    };
    return {
      summary: summary[locale],
      confidence: 'moderate',
      evidence: [{ label: 'Matched from what you wrote', value: symptom.matched.slice(0, 4).join(', ') }],
    };
  }

  if (ctx.recentBookings.length === 0) {
    const summary: Record<AgentLocale, string> = {
      en: 'There are no bookings on your account yet, so there is nothing for me to report on. A human colleague can help if you think that is wrong.',
      te: 'మీ ఖాతాలో ఇంకా ఎలాంటి బుకింగ్‌లు లేవు, కాబట్టి చెప్పడానికి ఏమీ లేదు. ఇది తప్పు అనిపిస్తే ఒక వ్యక్తి సహాయం చేయగలరు.',
      hi: 'आपके खाते में अभी कोई बुकिंग नहीं है, इसलिए बताने को कुछ नहीं है। अगर यह गलत लगे तो एक व्यक्ति मदद कर सकता है।',
    };
    return { summary: summary[locale], confidence: 'low', evidence: [] };
  }

  const latest = ctx.recentBookings[0];
  const summary: Record<AgentLocale, string> = {
    en: `Your most recent ${latest.type} booking is "${latest.status}". Fare: ₹${latest.fareTotal ?? '—'}.`,
    te: `మీ ఇటీవలి ${latest.type} బుకింగ్ స్థితి "${latest.status}". ఛార్జీ: ₹${latest.fareTotal ?? '—'}.`,
    hi: `आपकी सबसे हाल की ${latest.type} बुकिंग "${latest.status}" है। किराया: ₹${latest.fareTotal ?? '—'}।`,
  };
  return {
    summary: summary[locale],
    confidence: 'moderate',
    evidence: [
      { label: 'Booking status', value: latest.status },
      { label: 'Fare', value: `₹${latest.fareTotal ?? '—'}` },
      { label: 'Route', value: `${latest.pickup ?? '—'} → ${latest.drop ?? '—'}` },
    ],
  };
}

export { diagnoseCategory, bookingPathFor } from './symptoms';
