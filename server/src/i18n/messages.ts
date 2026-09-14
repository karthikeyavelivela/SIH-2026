import type { AppLocale } from '@fyro/shared';

// Phase 2 (server-side i18n). This is deliberately NOT a full translation
// of every English string in the codebase — that would mean touching
// hundreds of ApiError call sites and express-validator .withMessage()
// chains scattered across ~50 route/controller files. Instead this covers
// the highest-leverage chokepoints that give real coverage for the least
// risk:
//   - the central error handler (app.ts) — translates the small set of
//     MOST COMMON literal ApiError messages (auth, not-found, forbidden,
//     validation) via exact-string lookup below
//   - middleware/validate.ts — the one generic "Validation failed" wrapper
//     that fires on every single express-validator failure across the app
//   - kyc.service.ts's kycGateMessage() — the deterministic gate-blocked
//     message shown to a worker (not an admin's free-text KYC rejection
//     reason, which is arbitrary human-authored text and can't be
//     pre-translated by a catalog)
// Job 5 widened this considerably. The audit found 14 of ~190 distinct
// ApiError messages translated, which meant a worker running the app in
// Telugu hit English the moment anything went wrong — and an error is
// exactly the moment a person most needs to read their own language. The
// table now covers every message reachable from an ordinary user's path:
// booking, rating, dispatch, earnings, documents, payments, insurance,
// governance, the assistant and the SOS flow.
//
// What is still untranslated is the tail only an admin, a seeder or a
// malformed client can reach ("Unknown data source", "parentFederationId
// must reference a state federation", and similar). Any message NOT in this
// table falls back to its original English text — never a missing or blank
// message, just untranslated. That remaining tail is an honest, documented
// scope limit, not a bug.

type Catalog = Record<string, Record<AppLocale, string>>;

export const SERVER_MESSAGES: Catalog = {
  'Validation failed': {
    en: 'Validation failed',
    te: 'ధృవీకరణ విఫలమైంది',
    hi: 'सत्यापन विफल रहा',
  },
  'Not authenticated': {
    en: 'Not authenticated',
    te: 'మీరు లాగిన్ కాలేదు',
    hi: 'आप लॉग इन नहीं हैं',
  },
  'Invalid or expired token': {
    en: 'Invalid or expired token',
    te: 'సెషన్ ముగిసింది, దయచేసి మళ్ళీ లాగిన్ అవ్వండి',
    hi: 'सत्र समाप्त हो गया, कृपया फिर से लॉगिन करें',
  },
  'Invalid credentials': {
    en: 'Invalid credentials',
    te: 'ఫోన్ నంబర్ లేదా పాస్‌వర్డ్ తప్పు',
    hi: 'फ़ोन नंबर या पासवर्ड ग़लत है',
  },
  Forbidden: {
    en: 'Forbidden',
    te: 'మీకు ఈ చర్యకు అనుమతి లేదు',
    hi: 'आपको यह कार्रवाई करने की अनुमति नहीं है',
  },
  'No refresh token': {
    en: 'No refresh token',
    te: 'సెషన్ ముగిసింది, దయచేసి మళ్ళీ లాగిన్ అవ్వండి',
    hi: 'सत्र समाप्त हो गया, कृपया फिर से लॉगिन करें',
  },
  'Invalid or expired refresh token': {
    en: 'Invalid or expired refresh token',
    te: 'సెషన్ ముగిసింది, దయచేసి మళ్ళీ లాగిన్ అవ్వండి',
    hi: 'सत्र समाप्त हो गया, कृपया फिर से लॉगिन करें',
  },
  'Refresh token no longer valid': {
    en: 'Refresh token no longer valid',
    te: 'సెషన్ ముగిసింది, దయచేసి మళ్ళీ లాగిన్ అవ్వండి',
    hi: 'सत्र समाप्त हो गया, कृपया फिर से लॉगिन करें',
  },
  'Phone already registered': {
    en: 'Phone already registered',
    te: 'ఈ ఫోన్ నంబర్ ఇప్పటికే నమోదైంది',
    hi: 'यह फ़ोन नंबर पहले से पंजीकृत है',
  },
  'User not found': {
    en: 'User not found',
    te: 'యూజర్ కనబడలేదు',
    hi: 'उपयोगकर्ता नहीं मिला',
  },
  'Incorrect code': {
    en: 'Incorrect code',
    te: 'OTP తప్పు',
    hi: 'ओटीपी ग़लत है',
  },
  'This OTP has expired — request a new one': {
    en: 'This OTP has expired — request a new one',
    te: 'ఈ OTP గడువు ముగిసింది — కొత్తది కోరండి',
    hi: 'यह ओटीपी समाप्त हो गया है — नया मंगवाएँ',
  },
  'Too many incorrect attempts — request a new OTP': {
    en: 'Too many incorrect attempts — request a new OTP',
    te: 'చాలాసార్లు తప్పు OTP ఇచ్చారు — కొత్తది కోరండి',
    hi: 'बहुत बार ग़लत ओटीपी डाला — नया मंगवाएँ',
  },
  'Current password is incorrect': {
    en: 'Current password is incorrect',
    te: 'ప్రస్తుత పాస్‌వర్డ్ తప్పు',
    hi: 'मौजूदा पासवर्ड ग़लत है',
  },
  'Internal server error': {
    en: 'Internal server error',
    te: 'సర్వర్‌లో సమస్య వచ్చింది, దయచేసి కొద్దిసేపటి తర్వాత ప్రయత్నించండి',
    hi: 'सर्वर में समस्या आई है, कृपया कुछ देर बाद कोशिश करें',
  },
  'Booking not found': {
    en: 'Booking not found',
    te: 'బుకింగ్ దొరకలేదు',
    hi: 'बुकिंग नहीं मिली',
  },
  'Not found': {
    en: 'Not found',
    te: 'అది దొరకలేదు',
    hi: 'वह नहीं मिला',
  },
  'Forbidden: insufficient role': {
    en: 'Forbidden: insufficient role',
    te: 'మీ పాత్రకు ఈ చర్యకు అనుమతి లేదు',
    hi: 'आपकी भूमिका को यह कार्रवाई करने की अनुमति नहीं है',
  },
  'Forbidden: account does not hold this role': {
    en: 'Forbidden: account does not hold this role',
    te: 'మీ ఖాతాకు ఈ పాత్ర లేదు',
    hi: 'आपके खाते के पास यह भूमिका नहीं है',
  },
  'That phone number is already registered to an account': {
    en: 'That phone number is already registered to an account',
    te: 'ఆ ఫోన్ నంబర్ ఇప్పటికే ఒక ఖాతాకు నమోదై ఉంది',
    hi: 'वह फ़ोन नंबर पहले से एक खाते से जुड़ा है',
  },
  'Please rate your last completed booking before making a new one': {
    en: 'Please rate your last completed booking before making a new one',
    te: 'కొత్త బుకింగ్ చేసే ముందు మీ చివరి పూర్తయిన బుకింగ్‌కు రేటింగ్ ఇవ్వండి',
    hi: 'नई बुकिंग करने से पहले अपनी पिछली पूरी हुई बुकिंग को रेटिंग दें',
  },
  'Can only rate a completed booking': {
    en: 'Can only rate a completed booking',
    te: 'పూర్తయిన బుకింగ్‌కు మాత్రమే రేటింగ్ ఇవ్వగలరు',
    hi: 'केवल पूरी हुई बुकिंग को ही रेटिंग दी जा सकती है',
  },
  'Only a completed booking can be rated later': {
    en: 'Only a completed booking can be rated later',
    te: 'పూర్తయిన బుకింగ్‌ను మాత్రమే తర్వాత రేట్ చేయవచ్చు',
    hi: 'केवल पूरी हुई बुकिंग को ही बाद में रेट किया जा सकता है',
  },
  'You have already rated this booking': {
    en: 'You have already rated this booking',
    te: 'మీరు ఈ బుకింగ్‌కు ఇప్పటికే రేటింగ్ ఇచ్చారు',
    hi: 'आप इस बुकिंग को पहले ही रेटिंग दे चुके हैं',
  },
  'This booking has nobody assigned to rate': {
    en: 'This booking has nobody assigned to rate',
    te: 'ఈ బుకింగ్‌కు రేట్ చేయడానికి ఎవరూ కేటాయించబడలేదు',
    hi: 'इस बुकिंग में रेट करने के लिए कोई नियुक्त नहीं है',
  },
  'Address lookup is temporarily unavailable': {
    en: 'Address lookup is temporarily unavailable',
    te: 'చిరునామా వెతకడం ప్రస్తుతం పనిచేయట్లేదు — మళ్లీ ప్రయత్నించండి, లేదా మ్యాప్‌లో పిన్ పెట్టండి',
    hi: 'पता खोज अभी काम नहीं कर रही — फिर कोशिश करें, या मैप पर पिन लगाएं',
  },
  'lat/lng required': {
    en: 'lat/lng required',
    te: 'అక్షాంశం/రేఖాంశం అవసరం',
    hi: 'अक्षांश/देशांतर आवश्यक है',
  },
  'Invalid location: lat must be -90..90 and lng must be -180..180': {
    en: 'Invalid location: lat must be -90..90 and lng must be -180..180',
    te: 'స్థానం సరైనది కాదు',
    hi: 'स्थान सही नहीं है',
  },
  'A location is required to go online': {
    en: 'A location is required to go online',
    te: 'ఆన్‌లైన్‌లోకి రావడానికి మీ స్థానం అవసరం',
    hi: 'ऑनलाइन आने के लिए आपका स्थान आवश्यक है',
  },
  'Go online before accepting a job': {
    en: 'Go online before accepting a job',
    te: 'పని అంగీకరించే ముందు ఆన్‌లైన్‌లోకి రండి',
    hi: 'काम स्वीकार करने से पहले ऑनलाइन आएं',
  },
  'Go online before placing a bid': {
    en: 'Go online before placing a bid',
    te: 'బిడ్ వేసే ముందు ఆన్‌లైన్‌లోకి రండి',
    hi: 'बोली लगाने से पहले ऑनलाइन आएं',
  },
  'This job is no longer available': {
    en: 'This job is no longer available',
    te: 'ఈ పని ఇప్పుడు అందుబాటులో లేదు',
    hi: 'यह काम अब उपलब्ध नहीं है',
  },
  'This job has already started — ask the customer to cancel it instead': {
    en: 'This job has already started — ask the customer to cancel it instead',
    te: 'ఈ పని అప్పటికే మొదలైంది — దీన్ని రద్దు చేయమని కస్టమర్‌ను అడగండి',
    hi: 'यह काम शुरू हो चुका है — इसे रद्द करने के लिए ग्राहक से कहें',
  },
  'You are not assigned to this booking': {
    en: 'You are not assigned to this booking',
    te: 'ఈ బుకింగ్‌కు మీరు కేటాయించబడలేదు',
    hi: 'आप इस बुकिंग के लिए नियुक्त नहीं हैं',
  },
  'Not assigned to this booking': {
    en: 'Not assigned to this booking',
    te: 'ఈ బుకింగ్‌కు కేటాయించబడలేదు',
    hi: 'इस बुकिंग के लिए नियुक्त नहीं हैं',
  },
  'You do not own this booking': {
    en: 'You do not own this booking',
    te: 'ఈ బుకింగ్ మీది కాదు',
    hi: 'यह बुकिंग आपकी नहीं है',
  },
  'You were not a party to this booking': {
    en: 'You were not a party to this booking',
    te: 'ఈ బుకింగ్‌లో మీరు భాగం కాదు',
    hi: 'आप इस बुकिंग का हिस्सा नहीं थे',
  },
  'You were not part of this booking': {
    en: 'You were not part of this booking',
    te: 'ఈ బుకింగ్‌లో మీరు భాగం కాదు',
    hi: 'आप इस बुकिंग का हिस्सा नहीं थे',
  },
  'That booking was not found among your assigned jobs': {
    en: 'That booking was not found among your assigned jobs',
    te: 'మీకు కేటాయించిన పనుల్లో ఆ బుకింగ్ దొరకలేదు',
    hi: 'आपको सौंपे गए कामों में वह बुकिंग नहीं मिली',
  },
  'You are not the assigned driver for this booking': {
    en: 'You are not the assigned driver for this booking',
    te: 'ఈ బుకింగ్‌కు కేటాయించిన డ్రైవర్ మీరు కాదు',
    hi: 'आप इस बुकिंग के नियुक्त ड्राइवर नहीं हैं',
  },
  'No vehicle found for this driver': {
    en: 'No vehicle found for this driver',
    te: 'ఈ డ్రైవర్‌కు వాహనం నమోదు కాలేదు',
    hi: 'इस ड्राइवर के लिए कोई वाहन दर्ज नहीं है',
  },
  'Vehicle not found': {
    en: 'Vehicle not found',
    te: 'వాహనం దొరకలేదు',
    hi: 'वाहन नहीं मिला',
  },
  'This vehicle failed its last compliance inspection — get it re-inspected before accepting jobs': {
    en: 'This vehicle failed its last compliance inspection — get it re-inspected before accepting jobs',
    te: 'ఈ వాహనం చివరి తనిఖీలో విఫలమైంది — పనులు తీసుకునే ముందు మళ్లీ తనిఖీ చేయించండి',
    hi: 'यह वाहन पिछली जांच में विफल रहा — काम लेने से पहले दोबारा जांच कराएं',
  },
  'This vehicle failed its last compliance inspection — get it re-inspected before bidding': {
    en: 'This vehicle failed its last compliance inspection — get it re-inspected before bidding',
    te: 'ఈ వాహనం చివరి తనిఖీలో విఫలమైంది — బిడ్ వేసే ముందు మళ్లీ తనిఖీ చేయించండి',
    hi: 'यह वाहन पिछली जांच में विफल रहा — बोली लगाने से पहले दोबारा जांच कराएं',
  },
  'No hamali profile found for this user': {
    en: 'No hamali profile found for this user',
    te: 'ఈ ఖాతాకు హమాలీ ప్రొఫైల్ లేదు',
    hi: 'इस खाते के लिए हमाली प्रोफ़ाइल नहीं है',
  },
  'No Mutha found for this leader': {
    en: 'No Mutha found for this leader',
    te: 'ఈ నాయకుడికి సంఘం దొరకలేదు',
    hi: 'इस नेता के लिए कोई सोसायटी नहीं मिली',
  },
  'You are not a member of any Mutha group': {
    en: 'You are not a member of any Mutha group',
    te: 'మీరు ఏ సంఘంలోనూ సభ్యులు కాదు',
    hi: 'आप किसी सोसायटी के सदस्य नहीं हैं',
  },
  'You are not a member of this society': {
    en: 'You are not a member of this society',
    te: 'మీరు ఈ సంఘంలో సభ్యులు కాదు',
    hi: 'आप इस सोसायटी के सदस्य नहीं हैं',
  },
  'That user is not a member of your Mutha': {
    en: 'That user is not a member of your Mutha',
    te: 'ఆ వ్యక్తి మీ సంఘంలో సభ్యులు కాదు',
    hi: 'वह व्यक्ति आपकी सोसायटी का सदस्य नहीं है',
  },
  'One or more selected members are not online/available': {
    en: 'One or more selected members are not online/available',
    te: 'ఎంచుకున్న సభ్యుల్లో ఒకరు లేదా అంతకంటే ఎక్కువ మంది ఆన్‌లైన్‌లో లేరు',
    hi: 'चुने गए एक या अधिक सदस्य ऑनलाइन/उपलब्ध नहीं हैं',
  },
  'One or more selected members are already working another active job': {
    en: 'One or more selected members are already working another active job',
    te: 'ఎంచుకున్న సభ్యుల్లో ఒకరు లేదా అంతకంటే ఎక్కువ మంది ఇప్పటికే మరో పనిలో ఉన్నారు',
    hi: 'चुने गए एक या अधिक सदस्य पहले से दूसरे काम पर हैं',
  },
  'memberIds is required to assign members to this job': {
    en: 'memberIds is required to assign members to this job',
    te: 'ఈ పనికి సభ్యులను కేటాయించడానికి సభ్యులను ఎంచుకోండి',
    hi: 'इस काम के लिए सदस्य चुनना आवश्यक है',
  },
  'This job no longer has room for that many members': {
    en: 'This job no longer has room for that many members',
    te: 'ఈ పనిలో అంతమంది సభ్యులకు స్థలం లేదు',
    hi: 'इस काम में इतने सदस्यों के लिए जगह नहीं है',
  },
  'You are currently assigned to an active job — finish it before leaving the group': {
    en: 'You are currently assigned to an active job — finish it before leaving the group',
    te: 'మీరు ప్రస్తుతం ఒక పనిలో ఉన్నారు — సంఘం వదిలే ముందు దాన్ని పూర్తి చేయండి',
    hi: 'आप अभी एक काम पर हैं — समूह छोड़ने से पहले उसे पूरा करें',
  },
  'Only a solo hamali can withdraw from a crew seat': {
    en: 'Only a solo hamali can withdraw from a crew seat',
    te: 'సొంతంగా పనిచేసే హమాలీ మాత్రమే సిబ్బంది స్థానం నుండి వైదొలగగలరు',
    hi: 'केवल अकेले काम करने वाला हमाली ही क्रू सीट छोड़ सकता है',
  },
  'Can only pay for a completed booking': {
    en: 'Can only pay for a completed booking',
    te: 'పూర్తయిన బుకింగ్‌కు మాత్రమే చెల్లించగలరు',
    hi: 'केवल पूरी हुई बुकिंग का ही भुगतान किया जा सकता है',
  },
  'No payment order found for this booking — create one first': {
    en: 'No payment order found for this booking — create one first',
    te: 'ఈ బుకింగ్‌కు చెల్లింపు ఆర్డర్ లేదు — ముందు దాన్ని సృష్టించండి',
    hi: 'इस बुकिंग के लिए कोई भुगतान ऑर्डर नहीं है — पहले उसे बनाएं',
  },
  'No successful payment found for this booking yet — a tax invoice can only be issued for a paid booking': {
    en: 'No successful payment found for this booking yet — a tax invoice can only be issued for a paid booking',
    te: 'ఈ బుకింగ్‌కు ఇంకా చెల్లింపు పూర్తి కాలేదు — చెల్లించిన బుకింగ్‌కు మాత్రమే పన్ను రసీదు ఇస్తాం',
    hi: 'इस बुकिंग का भुगतान अभी पूरा नहीं हुआ — कर चालान केवल भुगतान की गई बुकिंग के लिए बनता है',
  },
  'UPI requires upiId': {
    en: 'UPI requires upiId',
    te: 'UPI కోసం UPI ఐడీ ఇవ్వండి',
    hi: 'UPI के लिए UPI आईडी दें',
  },
  'Bank transfer requires accountHolderName, bankAccountNumber, and ifsc': {
    en: 'Bank transfer requires accountHolderName, bankAccountNumber, and ifsc',
    te: 'బ్యాంక్ బదిలీకి ఖాతాదారు పేరు, ఖాతా నంబర్, IFSC అవసరం',
    hi: 'बैंक ट्रांसफर के लिए खाताधारक का नाम, खाता नंबर और IFSC आवश्यक है',
  },
  'No document of this type on file': {
    en: 'No document of this type on file',
    te: 'ఈ రకమైన పత్రం ఫైల్‌లో లేదు',
    hi: 'इस प्रकार का दस्तावेज़ फ़ाइल में नहीं है',
  },
  'No document of this type on file — upload it first': {
    en: 'No document of this type on file — upload it first',
    te: 'ఈ రకమైన పత్రం లేదు — ముందు అప్‌లోడ్ చేయండి',
    hi: 'इस प्रकार का दस्तावेज़ नहीं है — पहले अपलोड करें',
  },
  'A verified document cannot be deleted': {
    en: 'A verified document cannot be deleted',
    te: 'ధృవీకరించిన పత్రాన్ని తొలగించలేరు',
    hi: 'सत्यापित दस्तावेज़ हटाया नहीं जा सकता',
  },
  'This document is already verified — it cannot be replaced': {
    en: 'This document is already verified — it cannot be replaced',
    te: 'ఈ పత్రం ఇప్పటికే ధృవీకరించబడింది — దీన్ని మార్చలేరు',
    hi: 'यह दस्तावेज़ पहले ही सत्यापित है — इसे बदला नहीं जा सकता',
  },
  'File is empty': {
    en: 'File is empty',
    te: 'ఫైల్ ఖాళీగా ఉంది',
    hi: 'फ़ाइल खाली है',
  },
  'File too large (max 8MB)': {
    en: 'File too large (max 8MB)',
    te: 'ఫైల్ చాలా పెద్దది (గరిష్టం 8MB)',
    hi: 'फ़ाइल बहुत बड़ी है (अधिकतम 8MB)',
  },
  'Photo too large (max 5MB)': {
    en: 'Photo too large (max 5MB)',
    te: 'ఫోటో చాలా పెద్దది (గరిష్టం 5MB)',
    hi: 'फ़ोटो बहुत बड़ी है (अधिकतम 5MB)',
  },
  'Signature image is empty': {
    en: 'Signature image is empty',
    te: 'సంతకం చిత్రం ఖాళీగా ఉంది',
    hi: 'हस्ताक्षर की छवि खाली है',
  },
  'Signature image too large (max 2MB)': {
    en: 'Signature image too large (max 2MB)',
    te: 'సంతకం చిత్రం చాలా పెద్దది (గరిష్టం 2MB)',
    hi: 'हस्ताक्षर की छवि बहुत बड़ी है (अधिकतम 2MB)',
  },
  'Invalid invite code': {
    en: 'Invalid invite code',
    te: 'ఆహ్వాన కోడ్ సరైనది కాదు',
    hi: 'आमंत्रण कोड सही नहीं है',
  },
  'No phone change is pending — request an OTP first': {
    en: 'No phone change is pending — request an OTP first',
    te: 'ఫోన్ మార్పు ఏదీ పెండింగ్‌లో లేదు — ముందు OTP కోరండి',
    hi: 'कोई फ़ोन बदलाव लंबित नहीं है — पहले ओटीपी मंगवाएं',
  },
  'Complaint not found': {
    en: 'Complaint not found',
    te: 'ఫిర్యాదు దొరకలేదు',
    hi: 'शिकायत नहीं मिली',
  },
  'This complaint is already resolved': {
    en: 'This complaint is already resolved',
    te: 'ఈ ఫిర్యాదు ఇప్పటికే పరిష్కరించబడింది',
    hi: 'यह शिकायत पहले ही हल हो चुकी है',
  },
  'Dispute not found': {
    en: 'Dispute not found',
    te: 'వివాదం దొరకలేదు',
    hi: 'विवाद नहीं मिला',
  },
  'This dispute is already resolved': {
    en: 'This dispute is already resolved',
    te: 'ఈ వివాదం ఇప్పటికే పరిష్కరించబడింది',
    hi: 'यह विवाद पहले ही हल हो चुका है',
  },
  'Conversation not found': {
    en: 'Conversation not found',
    te: 'సంభాషణ దొరకలేదు',
    hi: 'बातचीत नहीं मिली',
  },
  'This conversation has already been passed to a human': {
    en: 'This conversation has already been passed to a human',
    te: 'ఈ సంభాషణ ఇప్పటికే ఒక వ్యక్తికి అప్పగించబడింది',
    hi: 'यह बातचीत पहले ही किसी व्यक्ति को सौंपी जा चुकी है',
  },
  'This conversation is full — start a new one': {
    en: 'This conversation is full — start a new one',
    te: 'ఈ సంభాషణ నిండిపోయింది — కొత్తది మొదలుపెట్టండి',
    hi: 'यह बातचीत भर गई — नई शुरू करें',
  },
  'A complaint has to be about a booking, and there are none on your account yet': {
    en: 'A complaint has to be about a booking, and there are none on your account yet',
    te: 'ఫిర్యాదు ఒక బుకింగ్ గురించి ఉండాలి, మీ ఖాతాలో ఇంకా బుకింగ్‌లు లేవు',
    hi: 'शिकायत किसी बुकिंग के बारे में होनी चाहिए, आपके खाते में अभी कोई बुकिंग नहीं है',
  },
  'Alert not found': {
    en: 'Alert not found',
    te: 'హెచ్చరిక దొరకలేదు',
    hi: 'चेतावनी नहीं मिली',
  },
  'This alert has already been picked up': {
    en: 'This alert has already been picked up',
    te: 'ఈ హెచ్చరికను ఇప్పటికే ఎవరో తీసుకున్నారు',
    hi: 'यह चेतावनी पहले ही किसी ने उठा ली है',
  },
  'This alert is already resolved': {
    en: 'This alert is already resolved',
    te: 'ఈ హెచ్చరిక ఇప్పటికే పరిష్కరించబడింది',
    hi: 'यह चेतावनी पहले ही हल हो चुकी है',
  },
  'Policy not found': {
    en: 'Policy not found',
    te: 'పాలసీ దొరకలేదు',
    hi: 'पॉलिसी नहीं मिली',
  },
  'Plan not found': {
    en: 'Plan not found',
    te: 'ప్లాన్ దొరకలేదు',
    hi: 'योजना नहीं मिली',
  },
  'Plan not found or not available to your role': {
    en: 'Plan not found or not available to your role',
    te: 'ప్లాన్ దొరకలేదు లేదా మీ పాత్రకు అందుబాటులో లేదు',
    hi: 'योजना नहीं मिली या आपकी भूमिका के लिए उपलब्ध नहीं है',
  },
  'You are already enrolled in this plan': {
    en: 'You are already enrolled in this plan',
    te: 'మీరు ఈ ప్లాన్‌లో ఇప్పటికే చేరారు',
    hi: 'आप इस योजना में पहले से नामांकित हैं',
  },
  'Explicit consent is required to enrol': {
    en: 'Explicit consent is required to enrol',
    te: 'చేరడానికి మీ స్పష్టమైన అంగీకారం అవసరం',
    hi: 'नामांकन के लिए आपकी स्पष्ट सहमति आवश्यक है',
  },
  'Cannot file a claim against a non-active policy': {
    en: 'Cannot file a claim against a non-active policy',
    te: 'అమలులో లేని పాలసీపై క్లెయిమ్ చేయలేరు',
    hi: 'निष्क्रिय पॉलिसी पर दावा नहीं किया जा सकता',
  },
  'Claim not found': {
    en: 'Claim not found',
    te: 'క్లెయిమ్ దొరకలేదు',
    hi: 'दावा नहीं मिला',
  },
  'Poll not found': {
    en: 'Poll not found',
    te: 'ఓటింగ్ దొరకలేదు',
    hi: 'मतदान नहीं मिला',
  },
  'Poll not found for your society': {
    en: 'Poll not found for your society',
    te: 'మీ సంఘంలో ఈ ఓటింగ్ దొరకలేదు',
    hi: 'आपकी सोसायटी में यह मतदान नहीं मिला',
  },
  'This poll is closed': {
    en: 'This poll is closed',
    te: 'ఈ ఓటింగ్ ముగిసింది',
    hi: 'यह मतदान बंद हो चुका है',
  },
  'This poll has passed its closing time': {
    en: 'This poll has passed its closing time',
    te: 'ఈ ఓటింగ్ గడువు ముగిసింది',
    hi: 'इस मतदान का समय समाप्त हो गया',
  },
  'You have already voted on this poll': {
    en: 'You have already voted on this poll',
    te: 'మీరు ఈ ఓటింగ్‌లో ఇప్పటికే ఓటు వేశారు',
    hi: 'आप इस मतदान में पहले ही वोट दे चुके हैं',
  },
  'A poll needs at least 2 options': {
    en: 'A poll needs at least 2 options',
    te: 'ఓటింగ్‌కు కనీసం 2 ఎంపికలు కావాలి',
    hi: 'मतदान के लिए कम से कम 2 विकल्प चाहिए',
  },
  'Invalid option index': {
    en: 'Invalid option index',
    te: 'ఎంపిక సరైనది కాదు',
    hi: 'विकल्प सही नहीं है',
  },
  'A surplus distribution for this exact period already exists': {
    en: 'A surplus distribution for this exact period already exists',
    te: 'ఈ కాలానికి మిగులు పంపిణీ ఇప్పటికే ఉంది',
    hi: 'इस अवधि के लिए अधिशेष वितरण पहले से मौजूद है',
  },
  'Already distributed': {
    en: 'Already distributed',
    te: 'ఇప్పటికే పంపిణీ చేశారు',
    hi: 'पहले ही वितरित किया जा चुका है',
  },
  'Surplus distribution not found for your society': {
    en: 'Surplus distribution not found for your society',
    te: 'మీ సంఘానికి మిగులు పంపిణీ దొరకలేదు',
    hi: 'आपकी सोसायटी के लिए अधिशेष वितरण नहीं मिला',
  },
  'Society not found': {
    en: 'Society not found',
    te: 'సంఘం దొరకలేదు',
    hi: 'सोसायटी नहीं मिली',
  },
  'Federation not found': {
    en: 'Federation not found',
    te: 'ఫెడరేషన్ దొరకలేదు',
    hi: 'फेडरेशन नहीं मिला',
  },
  'District federation not found': {
    en: 'District federation not found',
    te: 'జిల్లా ఫెడరేషన్ దొరకలేదు',
    hi: 'जिला फेडरेशन नहीं मिला',
  },
  'No federation assigned to this account': {
    en: 'No federation assigned to this account',
    te: 'ఈ ఖాతాకు ఫెడరేషన్ కేటాయించలేదు',
    hi: 'इस खाते को कोई फेडरेशन नहीं सौंपा गया',
  },
  'This society is already affiliated': {
    en: 'This society is already affiliated',
    te: 'ఈ సంఘం ఇప్పటికే అనుబంధంగా ఉంది',
    hi: 'यह सोसायटी पहले से संबद्ध है',
  },
  'No affiliated society with this id found under your federation': {
    en: 'No affiliated society with this id found under your federation',
    te: 'మీ ఫెడరేషన్ కింద ఈ సంఘం దొరకలేదు',
    hi: 'आपके फेडरेशन के तहत यह सोसायटी नहीं मिली',
  },
  'Training module not found': {
    en: 'Training module not found',
    te: 'శిక్షణ మాడ్యూల్ దొరకలేదు',
    hi: 'प्रशिक्षण मॉड्यूल नहीं मिला',
  },
  'This module is not part of your curriculum': {
    en: 'This module is not part of your curriculum',
    te: 'ఈ మాడ్యూల్ మీ పాఠ్యాంశాల్లో లేదు',
    hi: 'यह मॉड्यूल आपके पाठ्यक्रम में नहीं है',
  },
  'Complete the previous modules in order before this one': {
    en: 'Complete the previous modules in order before this one',
    te: 'దీనికి ముందు మాడ్యూల్స్‌ను వరుసగా పూర్తి చేయండి',
    hi: 'इससे पहले के मॉड्यूल क्रम से पूरे करें',
  },
  'Service category not found': {
    en: 'Service category not found',
    te: 'సేవా విభాగం దొరకలేదు',
    hi: 'सेवा श्रेणी नहीं मिली',
  },
  'Fare rule not found': {
    en: 'Fare rule not found',
    te: 'ఛార్జీ నియమం దొరకలేదు',
    hi: 'किराया नियम नहीं मिला',
  },
  'Saved address not found': {
    en: 'Saved address not found',
    te: 'సేవ్ చేసిన చిరునామా దొరకలేదు',
    hi: 'सहेजा गया पता नहीं मिला',
  },
  'requiredHamaliCount must be greater than 0 for hamali/combo bookings': {
    en: 'requiredHamaliCount must be greater than 0 for hamali/combo bookings',
    te: 'హమాలీ బుకింగ్‌కు కనీసం ఒక కార్మికుడిని ఎంచుకోవాలి',
    hi: 'हमाली बुकिंग के लिए कम से कम एक कर्मचारी चुनना होगा',
  },
  'requiredVehicles is required for truck/combo bookings': {
    en: 'requiredVehicles is required for truck/combo bookings',
    te: 'ట్రక్ బుకింగ్‌కు వాహన వివరాలు అవసరం',
    hi: 'ट्रक बुकिंग के लिए वाहन विवरण आवश्यक है',
  },
  'scheduledFor must be at least 30 minutes from now': {
    en: 'scheduledFor must be at least 30 minutes from now',
    te: 'షెడ్యూల్ సమయం ఇప్పటి నుండి కనీసం 30 నిమిషాల తర్వాత ఉండాలి',
    hi: 'निर्धारित समय अभी से कम से कम 30 मिनट बाद होना चाहिए',
  },
  'scheduledFor cannot be more than 14 days from now': {
    en: 'scheduledFor cannot be more than 14 days from now',
    te: 'షెడ్యూల్ సమయం 14 రోజుల కంటే ఎక్కువ ముందుగా ఉండకూడదు',
    hi: 'निर्धारित समय 14 दिन से अधिक आगे नहीं हो सकता',
  },
  'scheduledFor is not a valid date': {
    en: 'scheduledFor is not a valid date',
    te: 'షెడ్యూల్ తేదీ సరైనది కాదు',
    hi: 'निर्धारित तारीख़ सही नहीं है',
  },
  'This booking is not open for bidding': {
    en: 'This booking is not open for bidding',
    te: 'ఈ బుకింగ్ బిడ్డింగ్‌కు తెరిచి లేదు',
    hi: 'यह बुकिंग बोली के लिए खुली नहीं है',
  },
  'This load is not open for bidding': {
    en: 'This load is not open for bidding',
    te: 'ఈ లోడ్ బిడ్డింగ్‌కు తెరిచి లేదు',
    hi: 'यह लोड बोली के लिए खुला नहीं है',
  },
  'Bid not found or already settled': {
    en: 'Bid not found or already settled',
    te: 'బిడ్ దొరకలేదు లేదా ఇప్పటికే పరిష్కరించబడింది',
    hi: 'बोली नहीं मिली या पहले ही तय हो चुकी है',
  },
  'Booking not found or no longer open': {
    en: 'Booking not found or no longer open',
    te: 'బుకింగ్ దొరకలేదు లేదా ఇప్పుడు తెరిచి లేదు',
    hi: 'बुकिंग नहीं मिली या अब खुली नहीं है',
  },
  'Booking is not in transit': {
    en: 'Booking is not in transit',
    te: 'బుకింగ్ ప్రయాణంలో లేదు',
    hi: 'बुकिंग रास्ते में नहीं है',
  },
  'Already checked out': {
    en: 'Already checked out',
    te: 'ఇప్పటికే చెక్ అవుట్ అయ్యారు',
    hi: 'पहले ही चेक आउट हो चुका है',
  },
  'Not your halt': {
    en: 'Not your halt',
    te: 'ఇది మీ విరామం కాదు',
    hi: 'यह आपका ठहराव नहीं है',
  },
  'Halt not found': {
    en: 'Halt not found',
    te: 'విరామం దొరకలేదు',
    hi: 'ठहराव नहीं मिला',
  },
  'You have a booking in progress — finish or cancel it before deleting your account': {
    en: 'You have a booking in progress — finish or cancel it before deleting your account',
    te: 'మీకు ఒక బుకింగ్ నడుస్తోంది — ఖాతా తొలగించే ముందు దాన్ని పూర్తి చేయండి లేదా రద్దు చేయండి',
    hi: 'आपकी एक बुकिंग चल रही है — खाता हटाने से पहले उसे पूरा या रद्द करें',
  },
  'You have a payout awaiting approval or payment — this must be settled before deleting your account': {
    en: 'You have a payout awaiting approval or payment — this must be settled before deleting your account',
    te: 'మీ చెల్లింపు ఒకటి పెండింగ్‌లో ఉంది — ఖాతా తొలగించే ముందు అది పరిష్కారం కావాలి',
    hi: 'आपका एक भुगतान लंबित है — खाता हटाने से पहले उसका निपटान होना चाहिए',
  },
  'Notification not found': {
    en: 'Notification not found',
    te: 'నోటిఫికేషన్ దొరకలేదు',
    hi: 'सूचना नहीं मिली',
  },
  'This role does not receive job requests': {
    en: 'This role does not receive job requests',
    te: 'ఈ పాత్రకు పని అభ్యర్థనలు రావు',
    hi: 'इस भूमिका को काम के अनुरोध नहीं मिलते',
  },
  'This role does not have an availability toggle': {
    en: 'This role does not have an availability toggle',
    te: 'ఈ పాత్రకు అందుబాటు స్విచ్ లేదు',
    hi: 'इस भूमिका के लिए उपलब्धता स्विच नहीं है',
  },
  'This role does not participate in the load board': {
    en: 'This role does not participate in the load board',
    te: 'ఈ పాత్ర లోడ్ బోర్డులో పాల్గొనదు',
    hi: 'यह भूमिका लोड बोर्ड में भाग नहीं लेती',
  },
  'This role has no earnings view': {
    en: 'This role has no earnings view',
    te: 'ఈ పాత్రకు ఆదాయాల పేజీ లేదు',
    hi: 'इस भूमिका के लिए कमाई का पेज नहीं है',
  },
  'This role has no assigned-booking view': {
    en: 'This role has no assigned-booking view',
    te: 'ఈ పాత్రకు కేటాయించిన బుకింగ్‌ల పేజీ లేదు',
    hi: 'इस भूमिका के लिए सौंपी गई बुकिंग का पेज नहीं है',
  },
  'No fleet found for this account': {
    en: 'No fleet found for this account',
    te: 'ఈ ఖాతాకు వాహన సముదాయం లేదు',
    hi: 'इस खाते के लिए कोई फ़्लीट नहीं है',
  },
  'Vehicle not found in your fleet': {
    en: 'Vehicle not found in your fleet',
    te: 'మీ వాహన సముదాయంలో ఈ వాహనం లేదు',
    hi: 'आपके फ़्लीट में यह वाहन नहीं है',
  },
  'No warehouse hub found for this account': {
    en: 'No warehouse hub found for this account',
    te: 'ఈ ఖాతాకు గిడ్డంగి కేంద్రం లేదు',
    hi: 'इस खाते के लिए कोई गोदाम केंद्र नहीं है',
  },
  'Dock slot not found in your hub': {
    en: 'Dock slot not found in your hub',
    te: 'మీ కేంద్రంలో ఈ డాక్ స్లాట్ దొరకలేదు',
    hi: 'आपके केंद्र में यह डॉक स्लॉट नहीं मिला',
  },
};

/** Exact-string lookup with an untranslated-English fallback — see module doc comment above. */
export function t(message: string, locale: AppLocale): string {
  if (locale === 'en') return message;
  return SERVER_MESSAGES[message]?.[locale] ?? message;
}
