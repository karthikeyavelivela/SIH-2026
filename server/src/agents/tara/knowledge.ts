import type { AgentLocale } from '../locale';
import type { Retrieved } from '../../services/knowledge.service';

/**
 * TARA's two guardrails that run before any model is asked, and the
 * knowledge-base helpers the answer path uses.
 *
 * THE HAZARD CHECK IS CODE, NOT A PROMPT
 *
 * A model told not to give do-it-yourself advice about gas or mains
 * electricity will still occasionally give it. So a question describing one
 * of these dangers never reaches the model at all: it gets a fixed answer in
 * the asker's language that says to get safe, who to call, and that this
 * goes to a qualified person. That answer is the same with or without a key.
 */

export type Hazard = 'gas' | 'electrical' | 'structural';

// Cues are matched against the lower-cased question. Latin words are matched
// as words; Telugu and Devanagari as substrings because of their suffixes.
const GAS = /\b(gas|lpg|cylinder|regulator)\b.*\b(smell|smells|smelling|leak|leaks|leaking|hiss|hissing|fire|flame|burning|blast|explod\w*)\b|\b(smell|smells|smelling|leak|leaks|leaking|hiss|hissing)\b.*\b(gas|lpg|cylinder)\b|gas leak|smell of gas|smells? (like )?gas|గ్యాస్.*(వాసన|లీక్)|(వాసన|లీక్).*గ్యాస్|गैस.*(बदबू|महक|रिस|लीक)|(बदबू|महक|रिस|लीक).*गैस/;
const ELECTRICAL =
  /\b(sparks?|sparking|shock|shocked|electrocut\w*|short[- ]?circuit|exposed wires?|burning smell|smoke from (the )?(socket|switch|board|wire|meter)|wire.*(burning|sparking))\b|షాక్|స్పార్క్|शॉक|चिंगारी|करंट लग|शॉर्ट सर्किट/;
const STRUCTURAL = /\b(crack(s|ed)? in (the )?(wall|ceiling|beam|pillar)|ceiling (is )?(falling|collapsing|sagging)|wall (is )?(collapsing|leaning)|load[- ]bearing)\b|పైకప్పు.*(కూలు|పగ)|छत.*(गिर|दरार)|दीवार.*(गिर|दरार)/;

export function detectHazard(question: string): Hazard | null {
  const q = question.toLowerCase();
  if (GAS.test(q)) return 'gas';
  if (ELECTRICAL.test(q)) return 'electrical';
  if (STRUCTURAL.test(q)) return 'structural';
  return null;
}

const SAFETY: Record<Hazard, Record<AgentLocale, string>> = {
  gas: {
    en: 'Please get safe first: do not switch anything on or off and do not light a flame, open doors and windows, and leave the place. Then call your gas distributor’s emergency number, and 112 if there is any danger. Gas problems must be handled by a qualified person. I cannot give do-it-yourself advice for this.',
    te: 'ముందుగా సురక్షితంగా ఉండండి: ఏ స్విచ్ వేయవద్దు, ఆర్పవద్దు, నిప్పు వెలిగించవద్దు. తలుపులు, కిటికీలు తెరిచి ఆ చోటు నుండి బయటకు వెళ్ళండి. తర్వాత మీ గ్యాస్ పంపిణీదారు అత్యవసర నంబర్‌కు, ప్రమాదం ఉంటే 112కు కాల్ చేయండి. గ్యాస్ సమస్యను అర్హత ఉన్న వ్యక్తే చూడాలి. దీనికి నేను స్వయంగా చేసుకునే సలహా ఇవ్వలేను.',
    hi: 'पहले सुरक्षित हो जाएँ: कोई स्विच न चलाएँ, आग न जलाएँ, दरवाज़े-खिड़कियाँ खोलें और उस जगह से बाहर निकल जाएँ। फिर अपने गैस वितरक के आपातकालीन नंबर पर कॉल करें, और ख़तरा हो तो 112 पर। गैस की समस्या केवल योग्य व्यक्ति को ही देखनी चाहिए। इसके लिए मैं खुद करने की सलाह नहीं दे सकती।',
  },
  electrical: {
    en: 'Please keep away from it and do not touch any wiring, switchboard or socket. If it is safe to do so, switch the device off at the socket, or the main switch if you can reach it without touching anything damaged. If there is smoke, fire or someone has had a shock, call 112. Electrical faults must be handled by a qualified electrician. I cannot give do-it-yourself advice for this.',
    te: 'దయచేసి దాని నుండి దూరంగా ఉండండి, వైరింగ్, స్విచ్‌బోర్డ్ లేదా సాకెట్‌ను తాకవద్దు. సురక్షితమైతే పరికరాన్ని సాకెట్ వద్ద ఆఫ్ చేయండి, లేదా దెబ్బతిన్నదాన్ని తాకకుండా అందుతుంటే మెయిన్ స్విచ్ ఆఫ్ చేయండి. పొగ, మంటలు ఉంటే లేదా ఎవరికైనా షాక్ తగిలితే 112కు కాల్ చేయండి. విద్యుత్ సమస్యను అర్హత ఉన్న ఎలక్ట్రీషియన్ మాత్రమే చూడాలి. దీనికి నేను స్వయంగా చేసుకునే సలహా ఇవ్వలేను.',
    hi: 'कृपया उससे दूर रहें और किसी तार, स्विचबोर्ड या सॉकेट को न छुएँ। सुरक्षित हो तो उपकरण को सॉकेट पर बंद करें, या टूटी चीज़ को छुए बिना पहुँच में हो तो मुख्य स्विच बंद करें। धुआँ, आग हो या किसी को करंट लगा हो तो 112 पर कॉल करें। बिजली की ख़राबी केवल योग्य इलेक्ट्रीशियन को देखनी चाहिए। इसके लिए मैं खुद करने की सलाह नहीं दे सकती।',
  },
  structural: {
    en: 'Please move away from the affected wall or ceiling and keep others away. If it looks like it may fall, leave the room and call 112. Cracks, sagging and anything load-bearing must be checked by a qualified person. I cannot give do-it-yourself advice for this.',
    te: 'దయచేసి ప్రభావితమైన గోడ లేదా పైకప్పు నుండి దూరంగా వెళ్ళండి, ఇతరులను కూడా దూరంగా ఉంచండి. అది పడిపోయేలా కనిపిస్తే గది నుండి బయటకు వెళ్లి 112కు కాల్ చేయండి. పగుళ్లు, కుంగుబాటు, భారం మోసే ఏదైనా అర్హత ఉన్న వ్యక్తి తనిఖీ చేయాలి. దీనికి నేను స్వయంగా చేసుకునే సలహా ఇవ్వలేను.',
    hi: 'कृपया प्रभावित दीवार या छत से दूर हो जाएँ और दूसरों को भी दूर रखें। अगर गिरने का ख़तरा लगे तो कमरा छोड़ दें और 112 पर कॉल करें। दरार, झुकाव और भार उठाने वाली किसी भी चीज़ को योग्य व्यक्ति से जँचवाना चाहिए। इसके लिए मैं खुद करने की सलाह नहीं दे सकती।',
  },
};

const HAZARD_TRADE: Record<Hazard, string> = { gas: 'technician', electrical: 'electrician', structural: 'technician' };

export function safetyAnswer(hazard: Hazard, locale: AgentLocale): { summary: string; categorySlug: string } {
  return { summary: SAFETY[hazard][locale], categorySlug: HAZARD_TRADE[hazard] };
}

export const ESCALATE: Record<AgentLocale, string> = {
  en: 'I don’t know — escalate? I could not find this in FYRO’s guides or in your own records, and I would rather not guess. A person can take it from here.',
  te: 'నాకు తెలియదు — పైస్థాయికి పంపాలా? ఇది FYRO మార్గదర్శకాలలో లేదా మీ స్వంత రికార్డులలో నాకు కనిపించలేదు, ఊహించడం నాకు ఇష్టం లేదు. ఇక్కడి నుండి ఒక వ్యక్తి చూసుకోగలరు.',
  hi: 'मुझे नहीं पता — आगे भेजूँ? यह मुझे FYRO की गाइड या आपके अपने रिकॉर्ड में नहीं मिला, और मैं अंदाज़ा नहीं लगाना चाहती। यहाँ से कोई व्यक्ति संभाल सकता है।',
};

export const UNCONFIRMED: Record<AgentLocale, string> = {
  en: 'FYRO has not confirmed this yet, so I cannot state it. A person can tell you.',
  te: 'FYRO దీన్ని ఇంకా నిర్ధారించలేదు, కాబట్టి నేను చెప్పలేను. ఒక వ్యక్తి మీకు చెప్పగలరు.',
  hi: 'FYRO ने इसकी अभी पुष्टि नहीं की है, इसलिए मैं इसे बता नहीं सकती। कोई व्यक्ति आपको बता सकता है।',
};

/** Matches the answer a model gives when it has nothing to go on (any of the three languages' escalate line). */
export const DONT_KNOW = /i don[’']t know|don[’']t know|do not know|నాకు తెలియదు|मुझे नहीं पता/i;

export function citationOf(h: Retrieved): { source: string; heading: string; label: string } {
  return { source: h.source, heading: h.heading, label: `${h.source} › ${h.heading}` };
}

/** The passages as they appear in the prompt, each labelled so the model can cite it. */
export function knowledgeForPrompt(hits: Retrieved[]): string {
  return hits
    .map((h) => `[${h.source} › ${h.heading}]${h.hasPlaceholder ? ' (contains unconfirmed facts)' : ''}\n${h.text}`)
    .join('\n\n');
}

/** Does the question read as being about the person's own booking or payment? */
export function looksLikeRecordQuestion(q: string): boolean {
  return /\b(my (booking|order|job|fare|payment|refund|earnings?)|booking|order|job|fare|paid|payment|refund|status|where is|track|cancel|earn\w*)\b|బుకింగ్|ఛార్జీ|చెల్లింపు|बुकिंग|किराया|भुगतान/i.test(q);
}

/** The first couple of sentences of a passage, for the no-model answer. */
export function excerpt(text: string, max = 420): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return (stop > 120 ? cut.slice(0, stop + 1) : cut.trimEnd() + '…');
}
