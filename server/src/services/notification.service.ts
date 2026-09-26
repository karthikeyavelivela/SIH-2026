import { Notification, NotificationType } from '../models/Notification';
import { User } from '../models/User';
import type { AppLocale } from '@fyro/shared';

// Real per-locale copy for the notification types this phase actually
// wires up (see the call sites — booking matched/completed, KYC decision,
// payout paid, parametric insurance trigger). Interpolation is plain
// {placeholder} substitution, same convention as server/src/i18n/messages.ts.
type Template = (vars: Record<string, string | number>) => { title: string; body: string };

const TEMPLATES: Record<NotificationType, Record<AppLocale, Template>> = {
  booking_matched: {
    en: () => ({ title: 'Matched!', body: "Someone's on the way for your booking." }),
    te: () => ({ title: 'మ్యాచ్ అయింది!', body: 'మీ బుకింగ్ కోసం ఎవరో వస్తున్నారు.' }),
    hi: () => ({ title: 'मैच हो गया!', body: 'आपकी बुकिंग के लिए कोई रास्ते में है।' }),
  },
  booking_status: {
    en: (v) =>
      v.status === 'awaiting_confirmation'
        ? { title: 'Confirm your job', body: 'The worker has marked your job done. Confirm it, or report a problem.' }
        : { title: 'Booking update', body: `Your booking is now ${v.status}.` },
    te: (v) =>
      v.status === 'awaiting_confirmation'
        ? { title: 'మీ పనిని నిర్ధారించండి', body: 'కార్మికుడు మీ పని పూర్తయిందని గుర్తించారు. దానిని నిర్ధారించండి, లేదా సమస్యను తెలియజేయండి.' }
        : { title: 'బుకింగ్ అప్‌డేట్', body: `మీ బుకింగ్ ఇప్పుడు ${v.status}.` },
    hi: (v) =>
      v.status === 'awaiting_confirmation'
        ? { title: 'अपने काम की पुष्टि करें', body: 'कामगार ने आपका काम पूरा बताया है। पुष्टि करें, या समस्या बताएँ।' }
        : { title: 'बुकिंग अपडेट', body: `आपकी बुकिंग अब ${v.status} है।` },
  },
  kyc_decision: {
    en: (v) => ({
      title: v.status === 'verified' ? 'KYC approved' : 'KYC rejected',
      body: v.status === 'verified' ? 'Your documents were verified. You can go online now.' : `Your submission was rejected: ${v.reason}`,
    }),
    te: (v) => ({
      title: v.status === 'verified' ? 'KYC ఆమోదించబడింది' : 'KYC తిరస్కరించబడింది',
      body: v.status === 'verified' ? 'మీ డాక్యుమెంట్లు వెరిఫై చేయబడ్డాయి. మీరు ఇప్పుడు ఆన్‌లైన్‌లోకి వెళ్లవచ్చు.' : `మీ సమర్పణ తిరస్కరించబడింది: ${v.reason}`,
    }),
    hi: (v) => ({
      title: v.status === 'verified' ? 'KYC स्वीकृत' : 'KYC अस्वीकृत',
      body: v.status === 'verified' ? 'आपके दस्तावेज़ सत्यापित हो गए। अब आप ऑनलाइन जा सकते हैं।' : `आपका सबमिशन अस्वीकृत हुआ: ${v.reason}`,
    }),
  },
  payout: {
    en: (v) => ({ title: 'Payout paid', body: `₹${v.amount} has been paid out for ${v.period}.` }),
    te: (v) => ({ title: 'పేఅవుట్ చెల్లించబడింది', body: `${v.period} కోసం ₹${v.amount} చెల్లించబడింది.` }),
    hi: (v) => ({ title: 'भुगतान हुआ', body: `${v.period} के लिए ₹${v.amount} का भुगतान हो गया है।` }),
  },
  insurance_trigger: {
    en: (v) => ({ title: 'Insurance payout triggered', body: `₹${v.amount} was paid automatically — your earnings were below the covered threshold.` }),
    te: (v) => ({ title: 'ఇన్సూరెన్స్ పేఅవుట్ ట్రిగ్గర్ అయింది', body: `₹${v.amount} ఆటోమేటిక్‌గా చెల్లించబడింది — మీ ఆదాయం కవర్ చేసిన థ్రెషోల్డ్ కంటే తక్కువగా ఉంది.` }),
    hi: (v) => ({ title: 'बीमा भुगतान ट्रिगर हुआ', body: `₹${v.amount} अपने आप भुगतान हुआ — आपकी कमाई कवर की गई सीमा से कम थी।` }),
  },
  dispute_assigned: {
    en: (v) => ({ title: 'Dispute to resolve', body: `A dispute on booking ${v.ref} is now yours to resolve (${v.reason}). It moves up a level if not resolved by ${v.due}.` }),
    te: (v) => ({ title: 'పరిష్కరించాల్సిన వివాదం', body: `బుకింగ్ ${v.ref} పై వివాదం ఇప్పుడు మీరు పరిష్కరించాలి (${v.reason}). ${v.due} లోగా పరిష్కరించకపోతే అది పై స్థాయికి వెళ్తుంది.` }),
    hi: (v) => ({ title: 'निपटाने के लिए विवाद', body: `बुकिंग ${v.ref} का विवाद अब आपको निपटाना है (${v.reason})। ${v.due} तक न निपटा तो यह ऊपर के स्तर पर चला जाएगा।` }),
  },
  guarantee_rework: {
    en: (v) => ({ title: 'Guarantee re-work booked', body: `A customer claimed the workmanship guarantee on ${v.ref}. The re-work job is in your active jobs: the customer pays materials only, and your labour is paid ₹${v.labour} from the guarantee reserve.` }),
    te: (v) => ({ title: 'హామీ పునఃపని బుక్ అయింది', body: `${v.ref} పై కస్టమర్ పని నాణ్యత హామీని కోరారు. పునఃపని మీ యాక్టివ్ జాబ్స్‌లో ఉంది: కస్టమర్ సామగ్రికి మాత్రమే చెల్లిస్తారు, మీ శ్రమకు హామీ నిల్వ నుండి ₹${v.labour} చెల్లిస్తారు.` }),
    hi: (v) => ({ title: 'गारंटी पर दोबारा काम बुक हुआ', body: `ग्राहक ने ${v.ref} पर काम की गारंटी का दावा किया। दोबारा का काम आपकी सक्रिय जॉब में है: ग्राहक केवल सामान का भुगतान करेगा, और आपकी मज़दूरी ₹${v.labour} गारंटी रिज़र्व से दी जाएगी।` }),
  },
  training_assigned: {
    en: (v) => ({ title: 'Training assigned', body: `"${v.module}" has been added to your training after ${v.count} guarantee claims in 90 days. There is no penalty — it is there to help.` }),
    te: (v) => ({ title: 'శిక్షణ కేటాయించబడింది', body: `90 రోజుల్లో ${v.count} హామీ క్లెయిమ్‌ల తర్వాత "${v.module}" మీ శిక్షణలో చేర్చబడింది. ఎలాంటి జరిమానా లేదు — ఇది సహాయం కోసమే.` }),
    hi: (v) => ({ title: 'प्रशिक्षण दिया गया', body: `90 दिनों में ${v.count} गारंटी दावों के बाद "${v.module}" आपके प्रशिक्षण में जोड़ा गया है। कोई जुर्माना नहीं है — यह मदद के लिए है।` }),
  },
  welfare_payout: {
    en: (v) => ({ title: 'Welfare pool payment', body: `₹${v.amount} from the ${v.pool} welfare pool — work in your area dropped well below normal this week.` }),
    te: (v) => ({ title: 'సంక్షేమ నిధి చెల్లింపు', body: `${v.pool} సంక్షేమ నిధి నుండి ₹${v.amount} — ఈ వారం మీ ప్రాంతంలో పని సాధారణం కంటే చాలా తగ్గింది.` }),
    hi: (v) => ({ title: 'कल्याण कोष भुगतान', body: `${v.pool} कल्याण कोष से ₹${v.amount} — इस हफ़्ते आपके इलाक़े में काम सामान्य से बहुत कम रहा।` }),
  },
  dispute_update: {
    en: (v) => ({ title: 'Dispute update', body: `Your dispute is now ${v.status}.` }),
    te: (v) => ({ title: 'వివాద అప్‌డేట్', body: `మీ వివాదం ఇప్పుడు ${v.status}.` }),
    hi: (v) => ({ title: 'विवाद अपडेट', body: `आपका विवाद अब ${v.status} है।` }),
  },
  complaint_update: {
    en: (v) => ({ title: 'Complaint update', body: `Your complaint is now ${v.status}.` }),
    te: (v) => ({ title: 'ఫిర్యాదు అప్‌డేట్', body: `మీ ఫిర్యాదు ఇప్పుడు ${v.status}.` }),
    hi: (v) => ({ title: 'शिकायत अपडेट', body: `आपकी शिकायत अब ${v.status} है।` }),
  },
  unplanned_halt: {
    en: (v) => ({ title: 'Unplanned stop on your booking', body: `Your driver stopped outside a designated checkpoint for over ${v.minutes} minutes.` }),
    te: (v) => ({ title: 'మీ బుకింగ్‌లో ప్రణాళిక లేని ఆగుట', body: `మీ డ్రైవర్ నిర్దేశిత చెక్‌పాయింట్ వెలుపల ${v.minutes} నిమిషాలకు పైగా ఆగారు.` }),
    hi: (v) => ({ title: 'आपकी बुकिंग में अनियोजित रुकावट', body: `आपका ड्राइवर तय चेकपॉइंट के बाहर ${v.minutes} मिनट से अधिक रुका रहा।` }),
  },
  // Sent to the operations desk, not to the person in trouble — they are
  // busy having the emergency.
  emergency_alert: {
    en: (v) => ({ title: 'SOS raised', body: `${v.name ?? 'A worker'} raised an emergency alert (${v.kind ?? 'other'}).` }),
    te: (v) => ({ title: 'SOS వచ్చింది', body: `${v.name ?? 'ఒక కార్మికుడు'} అత్యవసర హెచ్చరిక పంపారు (${v.kind ?? 'other'}).` }),
    hi: (v) => ({ title: 'SOS आया', body: `${v.name ?? 'एक कर्मचारी'} ने आपातकालीन चेतावनी भेजी (${v.kind ?? 'other'})।` }),
  },
  // One template for every step of a quotation, keyed by the event, because a
  // customer tracking a quote cares which step it reached, not which of six
  // notification types the code calls it.
  quotation_update: {
    en: (v) => ({ title: 'Quotation update', body: `Your quotation moved to: ${String(v.event ?? 'updated').replace(/_/g, ' ')}.` }),
    te: (v) => ({ title: 'కోటేషన్ నవీకరణ', body: `మీ కోటేషన్ స్థితి: ${String(v.event ?? 'updated').replace(/_/g, ' ')}.` }),
    hi: (v) => ({ title: 'कोटेशन अपडेट', body: `आपका कोटेशन अब: ${String(v.event ?? 'updated').replace(/_/g, ' ')}।` }),
  },
  // Operational alerts, one template keyed by `kind`.
  system_alert: {
    en: (v) =>
      v.kind === 'wage_floor_stale'
        ? {
            title: 'Wage floor needs updating',
            body: `The minimum-wage notification for ${v.states} has passed its end date. The last notified rate is still being enforced. Enter the new notification.`,
          }
        : v.kind === 'repeat_guarantee_claims'
          ? {
              title: 'Member may need support',
              body: `${v.member} has had ${v.count} workmanship guarantee claims in 90 days. The "${v.module}" training has been assigned to them. No penalty applies.`,
            }
          : { title: 'System alert', body: String(v.message ?? '') },
    te: (v) =>
      v.kind === 'wage_floor_stale'
        ? {
            title: 'కనీస వేతనం నవీకరించాలి',
            body: `${v.states} కనీస వేతన నోటిఫికేషన్ గడువు ముగిసింది. చివరిగా ప్రకటించిన రేటు ఇంకా అమలులో ఉంది. కొత్త నోటిఫికేషన్‌ను నమోదు చేయండి.`,
          }
        : v.kind === 'repeat_guarantee_claims'
          ? {
              title: 'సభ్యుడికి సహాయం అవసరం కావచ్చు',
              body: `90 రోజుల్లో ${v.member} పై ${v.count} పని నాణ్యత హామీ క్లెయిమ్‌లు వచ్చాయి. వారికి "${v.module}" శిక్షణ కేటాయించబడింది. ఎలాంటి జరిమానా లేదు.`,
            }
          : { title: 'సిస్టమ్ హెచ్చరిక', body: String(v.message ?? '') },
    hi: (v) =>
      v.kind === 'wage_floor_stale'
        ? {
            title: 'न्यूनतम मज़दूरी अपडेट करें',
            body: `${v.states} की न्यूनतम मज़दूरी अधिसूचना की अवधि समाप्त हो गई है। अंतिम अधिसूचित दर अभी भी लागू है। नई अधिसूचना दर्ज करें।`,
          }
        : v.kind === 'repeat_guarantee_claims'
          ? {
              title: 'सदस्य को मदद की ज़रूरत हो सकती है',
              body: `90 दिनों में ${v.member} पर ${v.count} गारंटी दावे आए हैं। उन्हें "${v.module}" प्रशिक्षण दिया गया है। कोई जुर्माना नहीं है।`,
            }
          : { title: 'सिस्टम अलर्ट', body: String(v.message ?? '') },
  },
};

/**
 * The one write primitive for every notification in the app. Resolves the
 * target user's own preferredLocale (same field Phase 1/2's agent and
 * server-error localization already read) so the notification is written
 * already-translated — a later locale change doesn't retroactively
 * translate history, same accepted trade-off as chat messages and audit
 * logs elsewhere in this codebase. Never throws: a notification failing to
 * write must never take down the real action (booking accept, KYC
 * decision, payout) that triggered it.
 */
export async function createNotification(
  userId: string,
  type: NotificationType,
  vars: Record<string, string | number> = {},
  link?: string
): Promise<void> {
  try {
    const user = await User.findById(userId).select('preferredLocale').lean();
    const locale = ((user?.preferredLocale as AppLocale | undefined) ?? 'en') as AppLocale;
    const { title, body } = TEMPLATES[type][locale](vars);
    await Notification.create({ userId, type, title, body, link });
  } catch {
    // Best-effort — see doc comment above.
  }
}
