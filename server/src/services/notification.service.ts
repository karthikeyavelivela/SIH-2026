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
    en: (v) => ({ title: 'Booking update', body: `Your booking is now ${v.status}.` }),
    te: (v) => ({ title: 'బుకింగ్ అప్‌డేట్', body: `మీ బుకింగ్ ఇప్పుడు ${v.status}.` }),
    hi: (v) => ({ title: 'बुकिंग अपडेट', body: `आपकी बुकिंग अब ${v.status} है।` }),
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
