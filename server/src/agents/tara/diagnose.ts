import { callAgent } from '../client';
import { AgentResult } from '../types';
import type { AgentLocale } from '../locale';
import { diagnoseCategory, bookingPathFor } from './symptoms';
import { adviseMode, ratesFor, describeAdvice, type ModeAdvice } from './pricing';

/**
 * Scan and Diagnose — TARA, with an image.
 *
 * This is not a seventh agent. TARA already turns a plain-language
 * description of a problem into the right trade; this is the same job with
 * a photograph as the input instead of a sentence, going through the same
 * provider chain, carrying the same confidence and evidence, and ending in
 * the same place: a suggestion the person has to accept. Nothing here books
 * anything.
 *
 * TWO OUTCOMES, AND A THIRD THAT MATTERS MORE
 *
 * The model may say "you can probably fix this yourself" or "this is a
 * plumber's job". It may also say neither, and that case is the one worth
 * designing for: an unclear photograph that gets confidently misclassified
 * sends someone a tradesperson they did not need and a bill they did not
 * expect. So an unconfident answer returns no trade at all and the screen
 * offers the category picker instead.
 *
 * THE SAFETY RULE IS NOT A PROMPT
 *
 * A model instructed not to suggest dangerous fixes will still occasionally
 * suggest one. So the self-fix suggestion is suppressed in code, after the
 * model answers, for every category where a mistake is dangerous and for
 * any text that mentions the hazards below — the prompt asks, and this
 * enforces. Electrical work beyond switching something off, anything gas,
 * anything structural: those route to a trade with no do-it-yourself
 * advice attached, whatever the model returned.
 */

/** Trades where a wrong self-fix is dangerous, not merely unhelpful. */
const NEVER_SELF_FIX = new Set(['electrician', 'technician']);

/**
 * Hazards that suppress a self-fix suggestion whatever trade it came back
 * as — a "loose connection" in a photograph of a geyser is still mains
 * electricity. Matched case-insensitively against the model's own words.
 */
const HAZARD_WORDS = [
  'gas', 'lpg', 'cylinder', 'regulator', 'burner',
  'live wire', 'mains', 'electric', 'electrical', 'wiring', 'rewire', 'socket', 'switchboard',
  'shock', 'current', 'short circuit', 'fuse', 'mcb', 'meter box',
  'geyser', 'heater element', 'compressor', 'refrigerant', 'coolant',
  'load bearing', 'structural', 'beam', 'ceiling collapse', 'crack in the wall',
  'asbestos', 'sewage', 'gas leak', 'smell of gas',
];

export interface PhotoDiagnosis extends AgentResult {
  /** A safe step to try first, or undefined when there is none or it was suppressed. */
  selfFix?: string;
  /** Set when TARA is confident enough to name a trade. */
  suggestion?: {
    categorySlug: string;
    path: string;
    reason: string;
    pricing?: ModeAdvice;
  };
  /** True when nothing could be classified — the UI offers the picker instead of guessing. */
  inconclusive: boolean;
  /** Why a self-fix was withheld, when one was. Shown to the person, not hidden. */
  safetyNote?: string;
}

interface ModelShape {
  summary: string;
  confidence: 'low' | 'moderate' | 'high';
  evidence: { label: string; value: string }[];
  categorySlug?: string;
  reason?: string;
  selfFix?: string;
}

/** The twelve slugs a diagnosis may land on. Anything else is treated as no answer. */
const KNOWN_SLUGS = new Set([
  'electrician', 'plumber', 'carpenter', 'painter', 'cleaner', 'gardener',
  'technician', 'domestic_helper', 'caregiver', 'driver',
  'general_labour', 'general_logistics',
]);

function mentionsHazard(text: string): boolean {
  const lower = text.toLowerCase();
  return HAZARD_WORDS.some((w) => lower.includes(w));
}

export async function diagnosePhoto(opts: {
  image: { mediaType: string; data: string };
  note?: string;
  region?: string;
  locale: AgentLocale;
}): Promise<PhotoDiagnosis> {
  const { image, note, region, locale } = opts;

  const systemPrompt = `You are TARA, the assistant inside FYRO, an Indian cooperative marketplace for household trades. A customer has photographed a problem in their home and wants to know what it is and who fixes it.

Look at the photograph. Decide which ONE of these trades the problem belongs to, using exactly these slugs: electrician, plumber, carpenter, painter, cleaner, gardener, technician (appliances - AC, fridge, washing machine, TV, geyser, microwave, water purifier), domestic_helper, caregiver, driver, general_labour, general_logistics.

If you cannot tell what the photograph shows, or it does not show a household problem at all, set "categorySlug" to null and say plainly in the summary that you cannot tell from this photo. NEVER guess a trade to be helpful. A wrong trade sends a real person to this customer's home and bills them for it.

Only suggest a "selfFix" when ALL of these are true: the fix is genuinely simple, needs no tools beyond a spanner or a cloth, and carries no risk of injury, flooding, fire or electric shock. Never suggest anything involving mains electricity beyond switching a device off at the socket, anything involving gas, and anything structural. When in doubt, omit selfFix entirely and let the trade handle it.

Be brief and plain. Many readers are not highly literate. Two or three short sentences.

Respond ONLY with JSON: {"summary": "<what you see and what it means>", "confidence": "low"|"moderate"|"high", "categorySlug": "<slug>"|null, "reason": "<one short clause: why this trade>", "selfFix": "<one safe step>"|null, "evidence": [{"label":"<what in the photo>","value":"<what it tells you>"}]}`;

  const userPrompt = note?.trim()
    ? `The customer also wrote: "${note.trim()}"`
    : 'The customer added no note — go only on what the photograph shows.';

  const result = await callAgent(
    {
      agentName: 'tara-diagnose',
      systemPrompt,
      userPrompt,
      context: { hasNote: !!note?.trim(), note: note?.trim() ?? null },
      image,
      locale,
    },
    // No model configured, or every provider failed. There is no rule-based
    // way to look at a photograph, so this says so rather than pretending:
    // the note, if there is one, still goes through the existing text
    // matcher, which is a real answer from a real input.
    (ctx) => ruleBasedFromNote((ctx as { note?: string | null }).note ?? undefined, locale)
  );

  const parsed = result as unknown as Partial<ModelShape>;
  const rawSlug = typeof parsed.categorySlug === 'string' ? parsed.categorySlug : undefined;
  const slug = rawSlug && KNOWN_SLUGS.has(rawSlug) ? rawSlug : undefined;

  // Low confidence is not a weaker answer, it is no answer. Naming a trade
  // the model is unsure of is how someone ends up paying a call-out fee for
  // the wrong tradesperson.
  const inconclusive = !slug || result.confidence === 'low';

  let selfFix = typeof parsed.selfFix === 'string' && parsed.selfFix.trim() ? parsed.selfFix.trim() : undefined;
  let safetyNote: string | undefined;

  if (selfFix) {
    if (slug && NEVER_SELF_FIX.has(slug)) {
      selfFix = undefined;
      safetyNote = SAFETY_NOTE[locale] ?? SAFETY_NOTE.en;
    } else if (mentionsHazard(selfFix) || mentionsHazard(result.summary)) {
      selfFix = undefined;
      safetyNote = SAFETY_NOTE[locale] ?? SAFETY_NOTE.en;
    }
  }

  let pricing: ModeAdvice | undefined;
  if (slug && !inconclusive) {
    const { mode, unitType } = adviseMode(note ?? '', slug);
    pricing = await ratesFor(slug, mode, unitType, region);
    // describeAdvice is what keeps a figure out of the answer when nobody
    // has published a rate; it is called for its guardrail, not its text.
    describeAdvice(pricing, slug);
  }

  return {
    ...result,
    selfFix,
    safetyNote,
    inconclusive,
    suggestion:
      slug && !inconclusive
        ? {
            categorySlug: slug,
            path: bookingPathFor(slug),
            reason: typeof parsed.reason === 'string' ? parsed.reason : '',
            pricing,
          }
        : undefined,
  };
}

const SAFETY_NOTE: Record<string, string> = {
  en: 'There is a safe fix for some problems, but not this one — electricity, gas and anything structural go to a qualified person, every time.',
  te: 'కొన్ని సమస్యలకు మీరే చేయగలిగే పరిష్కారం ఉంటుంది, కానీ దీనికి కాదు — కరెంటు, గ్యాస్, నిర్మాణ సంబంధిత పనులు ప్రతిసారీ నిపుణుడికే.',
  hi: 'कुछ दिक्कतें आप खुद ठीक कर सकते हैं, पर यह नहीं — बिजली, गैस और ढाँचे से जुड़ा काम हर बार किसी जानकार से ही कराएँ।',
};

/**
 * The answer when no vision provider is configured.
 *
 * It does not pretend to have looked at anything. If the customer wrote a
 * note, that note still goes through the same keyword matcher TARA's text
 * path uses, which is a genuine answer from a genuine input; if they wrote
 * nothing, this says plainly that the photo could not be analysed.
 */
type MockShape = Pick<AgentResult, 'summary' | 'confidence' | 'evidence'> & {
  categorySlug?: string;
  reason?: string;
};

function ruleBasedFromNote(note: string | undefined, locale: AgentLocale): MockShape {
  const symptom = note ? diagnoseCategory(note) : null;

  if (symptom) {
    const summary: Record<string, string> = {
      en: `No photo analysis is available right now, but from what you wrote this sounds like a job for a ${symptom.slug.replace(/_/g, ' ')}. Check the suggestion below before booking.`,
      te: `ప్రస్తుతం ఫోటో విశ్లేషణ అందుబాటులో లేదు, కానీ మీరు రాసిన దాని ప్రకారం ఇది ${symptom.slug.replace(/_/g, ' ')} పనిలా ఉంది. బుక్ చేసే ముందు కింది సూచనను చూడండి.`,
      hi: `अभी फ़ोटो की जाँच उपलब्ध नहीं है, पर आपने जो लिखा उससे यह ${symptom.slug.replace(/_/g, ' ')} का काम लगता है। बुक करने से पहले नीचे का सुझाव देखें।`,
    };
    return {
      summary: summary[locale] ?? summary.en,
      confidence: 'moderate',
      evidence: [{ label: 'Matched from your note', value: symptom.matched.slice(0, 4).join(', ') }],
      categorySlug: symptom.slug,
      reason: 'matched from your note',
    };
  }

  const summary: Record<string, string> = {
    en: 'The photo could not be analysed right now. Pick the service you need and a worker will see this photo before they arrive.',
    te: 'ప్రస్తుతం ఫోటోను విశ్లేషించలేకపోయాం. మీకు కావలసిన సేవను ఎంచుకోండి — కార్మికుడు రాకముందే ఈ ఫోటోను చూస్తారు.',
    hi: 'अभी फ़ोटो की जाँच नहीं हो सकी। आपको जो सेवा चाहिए वह चुनें — कारीगर आने से पहले यह फ़ोटो देख लेगा।',
  };
  return {
    summary: summary[locale] ?? summary.en,
    confidence: 'low',
    evidence: [],
  };
}
