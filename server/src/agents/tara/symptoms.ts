/**
 * Symptom -> service category.
 *
 * People do not arrive saying "I would like to book an electrician". They
 * say "no power in the kitchen", "కరెంటు పోయింది", "पंखा नहीं चल रहा". This
 * maps what they actually say onto one of the twelve seeded service
 * categories, in all three languages the app speaks.
 *
 * Deliberately NOT an LLM call:
 *
 *   - it must work identically when no model key is configured, because
 *     the whole point is routing someone to the right booking screen;
 *   - it must be inspectable — a wrong match here sends a person to the
 *     wrong trade, and "the model decided" is not an answer we could debug;
 *   - it costs nothing and adds no latency to the assistant's first reply.
 *
 * The model still writes the ANSWER. This only decides which booking screen
 * to offer alongside it, and TARA never books anything itself.
 *
 * Matching is word-boundary-aware for Latin script and substring-based for
 * Telugu and Devanagari, which are agglutinative enough that a suffixed form
 * ("కరెంటుకి") would miss an exact-word match.
 */

export interface SymptomMatch {
  slug: string;
  /** The terms that actually matched — shown to the user, so a wrong match is visibly a wrong match rather than a mystery. */
  matched: string[];
}

interface CategorySymptoms {
  slug: string;
  en: string[];
  te: string[];
  hi: string[];
}

/** All twelve seeded categories — see scripts/seedServiceCategories.ts. */
export const SYMPTOMS: CategorySymptoms[] = [
  {
    slug: 'electrician',
    en: ['no power', 'power cut', 'current', 'short circuit', 'shock', 'fuse', 'wiring', 'switch', 'socket', 'mcb', 'inverter', 'fan not working', 'light not working', 'bulb', 'meter', 'electric'],
    te: ['కరెంటు', 'విద్యుత్', 'షాక్', 'ఫ్యూజ్', 'వైరింగ్', 'స్విచ్', 'బల్బ్', 'లైట్ రావట్లేదు', 'ఫ్యాన్ తిరగట్లేదు', 'మీటర్'],
    hi: ['बिजली', 'करंट', 'शॉक', 'फ्यूज', 'वायरिंग', 'स्विच', 'बल्ब', 'लाइट नहीं', 'पंखा नहीं', 'मीटर', 'शॉर्ट सर्किट'],
  },
  {
    slug: 'plumber',
    en: ['leak', 'leaking', 'tap', 'faucet', 'pipe', 'drain', 'blocked', 'clogged', 'toilet', 'flush', 'water not coming', 'no water', 'sink', 'overflow', 'motor not pumping', 'sump', 'bathroom'],
    te: ['లీక్', 'కుళాయి', 'పైపు', 'నీళ్లు రావట్లేదు', 'డ్రైనేజ్', 'మురుగు', 'టాయిలెట్', 'బాత్రూమ్', 'సంప్'],
    hi: ['लीक', 'नल', 'पाइप', 'पानी नहीं', 'नाली', 'जाम', 'टॉयलेट', 'बाथरूम', 'फ्लश', 'टंकी'],
  },
  {
    slug: 'carpenter',
    en: ['door', 'hinge', 'cupboard', 'wardrobe', 'furniture', 'table', 'chair', 'wood', 'termite', 'drawer', 'lock not', 'window frame', 'shelf'],
    te: ['తలుపు', 'కిటికీ', 'బీరువా', 'ఫర్నిచర్', 'కుర్చీ', 'టేబుల్', 'చెక్క', 'చెదలు', 'అల్మారా'],
    hi: ['दरवाजा', 'कब्जा', 'अलमारी', 'फर्नीचर', 'मेज', 'कुर्सी', 'लकड़ी', 'दीमक', 'खिड़की', 'ताला नहीं'],
  },
  {
    slug: 'painter',
    en: ['paint', 'painting', 'whitewash', 'putty', 'wall colour', 'wall color', 'peeling', 'distemper', 'primer', 'repaint'],
    te: ['పెయింట్', 'రంగు', 'వైట్ వాష్', 'గోడ రంగు', 'పుట్టీ'],
    hi: ['पेंट', 'रंग', 'सफेदी', 'पुट्टी', 'दीवार का रंग', 'रंगाई'],
  },
  {
    slug: 'cleaner',
    en: ['clean', 'cleaning', 'deep clean', 'dust', 'mop', 'sweep', 'bathroom cleaning', 'kitchen cleaning', 'sofa cleaning', 'tank cleaning', 'garbage'],
    te: ['శుభ్రం', 'క్లీనింగ్', 'తుడవడం', 'దుమ్ము', 'చెత్త', 'ట్యాంక్ క్లీనింగ్'],
    hi: ['सफाई', 'साफ', 'झाड़ू', 'पोछा', 'धूल', 'कचरा', 'टंकी सफाई'],
  },
  {
    slug: 'domestic_helper',
    en: ['house help', 'maid', 'housemaid', 'cook', 'cooking', 'utensils', 'dishes', 'laundry', 'washing clothes', 'household help', 'daily help'],
    te: ['పనిమనిషి', 'వంట', 'గిన్నెలు', 'బట్టలు ఉతకడం', 'ఇంటి పని'],
    hi: ['नौकरानी', 'घरेलू सहायक', 'खाना बनाना', 'बर्तन', 'कपड़े धोना', 'घर का काम'],
  },
  {
    slug: 'caregiver',
    en: ['caregiver', 'care taker', 'caretaker', 'elderly', 'old age', 'patient care', 'bedridden', 'attendant', 'nursing', 'baby care', 'child care', 'after surgery'],
    te: ['సంరక్షకుడు', 'వృద్ధుల', 'పేషెంట్', 'అటెండర్', 'నర్సింగ్', 'పిల్లల సంరక్షణ'],
    hi: ['देखभाल', 'बुजुर्ग', 'मरीज', 'अटेंडेंट', 'नर्सिंग', 'बच्चे की देखभाल'],
  },
  {
    slug: 'gardener',
    en: ['garden', 'gardening', 'lawn', 'plants', 'grass cutting', 'tree cutting', 'pruning', 'hedge', 'nursery', 'watering plants'],
    te: ['తోట', 'గార్డెన్', 'మొక్కలు', 'గడ్డి', 'చెట్టు కొట్టడం'],
    hi: ['बगीचा', 'बागवानी', 'पौधे', 'घास', 'पेड़ काटना', 'लॉन'],
  },
  {
    slug: 'technician',
    en: ['ac not', 'air conditioner', 'fridge', 'refrigerator', 'washing machine', 'geyser', 'microwave', 'tv not', 'appliance', 'repair machine', 'servicing', 'chimney', 'water purifier', 'ro'],
    te: ['ఏసీ', 'ఫ్రిజ్', 'వాషింగ్ మెషిన్', 'గీజర్', 'టీవీ', 'రిపేర్', 'మైక్రోవేవ్'],
    hi: ['एसी', 'फ्रिज', 'वॉशिंग मशीन', 'गीजर', 'माइक्रोवेव', 'टीवी', 'मरम्मत', 'आरओ'],
  },
  {
    slug: 'driver',
    en: ['need a driver', 'hire driver', 'drive my car', 'driver for', 'outstation driver', 'personal driver'],
    te: ['డ్రైవర్ కావాలి', 'డ్రైవర్ కోసం', 'కారు నడపడానికి'],
    hi: ['ड्राइवर चाहिए', 'ड्राइवर के लिए', 'गाड़ी चलाने'],
  },
  {
    slug: 'general_labour',
    en: ['loading', 'unloading', 'hamali', 'porter', 'coolie', 'lift heavy', 'carry bags', 'labour', 'labor', 'workers needed', 'manpower', 'shifting help'],
    te: ['లోడింగ్', 'అన్‌లోడింగ్', 'హమాలీ', 'కూలీ', 'బరువు', 'కార్మికులు'],
    hi: ['लोडिंग', 'अनलोडिंग', 'हमाली', 'कुली', 'मजदूर', 'भारी सामान', 'पल्लेदार'],
  },
  {
    slug: 'general_logistics',
    en: ['transport', 'truck', 'lorry', 'tempo', 'shifting', 'move goods', 'send goods', 'delivery', 'cargo', 'consignment', 'house shifting', 'freight', 'vehicle to carry'],
    te: ['రవాణా', 'లారీ', 'ట్రక్', 'టెంపో', 'సామాను పంపడం', 'షిఫ్టింగ్', 'డెలివరీ'],
    hi: ['ट्रांसपोर्ट', 'ट्रक', 'लॉरी', 'टेंपो', 'सामान भेजना', 'शिफ्टिंग', 'डिलीवरी', 'माल'],
  },
];

const LATIN = /^[\x20-\x7E]*$/;

function hits(haystack: string, term: string): boolean {
  if (LATIN.test(term)) {
    // Word-boundary match so "ro" does not fire inside "from" and "ac not"
    // does not fire inside "track nothing".
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack);
  }
  return haystack.includes(term);
}

/**
 * Best category for what the person described, or null when nothing matched.
 *
 * All three languages are searched regardless of the caller's locale: people
 * mix scripts constantly ("AC repair kavali"), and a Telugu speaker typing
 * an English word should not be worse off than an English speaker.
 *
 * Ties are broken by the LONGEST matched term, then by the order in SYMPTOMS
 * (specific trades before the two general categories, which is why
 * general_labour and general_logistics are last). The length rule is what
 * settles a sentence naming both an object and an action: "बगीचा साफ करवाना
 * है" — get the GARDEN CLEANED — matches "साफ" (clean) and "बगीचा" (garden)
 * once each, and the longer, more specific noun is the one that says which
 * trade the person actually needs.
 */
export function diagnoseCategory(text: string): SymptomMatch | null {
  const haystack = text.toLowerCase();
  let best: SymptomMatch | null = null;
  let bestLongest = 0;

  for (const cat of SYMPTOMS) {
    const matched = [...cat.en, ...cat.te, ...cat.hi].filter((term) => hits(haystack, term.toLowerCase()));
    if (matched.length === 0) continue;
    const longest = Math.max(...matched.map((m) => m.length));
    const better =
      !best || matched.length > best.matched.length || (matched.length === best.matched.length && longest > bestLongest);
    if (better) {
      best = { slug: cat.slug, matched };
      bestLongest = longest;
    }
  }

  return best;
}

/** Where a matched category sends the person. TARA offers the link; the
 *  human decides whether to follow it, and the booking screen itself is
 *  unchanged — nothing here creates a booking. */
export function bookingPathFor(slug: string): string {
  if (slug === 'general_logistics') return '/customer/book/transport';
  if (slug === 'general_labour') return '/customer/book/labour';
  return `/customer/service/${slug}`;
}
