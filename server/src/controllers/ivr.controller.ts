import crypto from 'crypto';
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';
import { User } from '../models/User';
import { Mutha } from '../models/Mutha';
import { Booking } from '../models/Booking';
import { CallbackRequest } from '../models/CallbackRequest';
import { writeAuditLog } from '../services/audit.service';

/**
 * The phone line, through Exotel.
 *
 * Exotel's applets call a URL we configure, with the call's details as query
 * parameters (CallSid, From, and digits when the caller pressed keys), and
 * speak what we answer with. Two URLs:
 *
 *   next-assignment   a society leader rings and hears the next jobs given to
 *                     their members who have no phone, in Telugu or Hindi
 *   callback-request  anyone rings and asks for a call back to help them book
 *
 * Exotel does not sign its requests, so the URL carries a secret (the
 * IVR_SHARED_SECRET in `token`). With the feature off or the secret wrong the
 * answer is a plain refusal and nothing is read or written.
 *
 * The answers are plain text in the caller's language. How Exotel turns that
 * text into speech, and which applets point at these URLs, is set up in the
 * Exotel dashboard; see DEPLOY_CHECKLIST.md.
 */
type Lang = 'en' | 'te' | 'hi';

const LANGS: Lang[] = ['en', 'te', 'hi'];
const MAX_SPOKEN_CHARS = 700;

export function ivrAuthorised(token: unknown): boolean {
  if (env.IVR_ENABLED !== true || !env.IVR_SHARED_SECRET || typeof token !== 'string') return false;
  const a = Buffer.from(token);
  const b = Buffer.from(env.IVR_SHARED_SECRET);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Exotel reports the caller as 0XXXXXXXXXX or +91XXXXXXXXXX; accounts store ten digits. */
export function callerDigits(from: unknown): string | null {
  const d = String(from ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : null;
}

const pickLang = (asked: unknown, fallback: string | undefined): Lang => {
  if (typeof asked === 'string' && (LANGS as string[]).includes(asked)) return asked as Lang;
  return (LANGS as string[]).includes(fallback ?? '') ? (fallback as Lang) : 'te';
};

const SAY = {
  unknown: {
    en: 'This number is not registered with FYRO as a society leader. Please ask your leader to call.',
    te: 'ఈ నంబర్ FYROలో సొసైటీ లీడర్‌గా నమోదు కాలేదు. దయచేసి మీ లీడర్‌ను కాల్ చేయమనండి.',
    hi: 'यह नंबर FYRO में सोसाइटी लीडर के रूप में दर्ज नहीं है। कृपया अपने लीडर से कॉल करने को कहें।',
  },
  none: {
    en: 'There are no jobs waiting for your members without phones right now.',
    te: 'ఫోన్ లేని మీ సభ్యులకు ప్రస్తుతం ఎలాంటి పనులూ లేవు.',
    hi: 'अभी फ़ोन-रहित आपके सदस्यों के लिए कोई काम नहीं है।',
  },
  job: {
    en: (m: string, w: string, p: string) => `${m} has a job ${w} at ${p}.`,
    te: (m: string, w: string, p: string) => `${m} కు ${w} ${p} వద్ద పని ఉంది.`,
    hi: (m: string, w: string, p: string) => `${m} का ${w} ${p} पर काम है।`,
  },
  soon: { en: 'soon', te: 'త్వరలో', hi: 'जल्द' },
  thanks: {
    en: 'Thank you. Someone from FYRO will call you back soon.',
    te: 'ధన్యవాదాలు. FYRO నుండి ఎవరైనా మీకు త్వరలో తిరిగి కాల్ చేస్తారు.',
    hi: 'धन्यवाद। FYRO से कोई जल्द ही आपको वापस कॉल करेगा।',
  },
  refused: 'Not available.',
};

function plain(res: Response, text: string) {
  res.status(200).type('text/plain').send(text.slice(0, MAX_SPOKEN_CHARS));
}

function whenSpoken(at: Date | undefined, lang: Lang): string {
  if (!at) return SAY.soon[lang];
  const ist = new Date(new Date(at).getTime() + 5.5 * 3600_000);
  const digits = (n: number) => String(n).padStart(2, '0');
  return `${ist.getUTCDate()}/${ist.getUTCMonth() + 1} ${digits(ist.getUTCHours())}:${digits(ist.getUTCMinutes())}`;
}

export const nextAssignment = asyncHandler(async (req: Request, res: Response) => {
  if (!ivrAuthorised(req.query.token)) return void res.status(403).type('text/plain').send(SAY.refused);

  const digits = callerDigits(req.query.From);
  const leader = digits ? await User.findOne({ phone: digits, role: 'mutha_leader', accountStatus: { $ne: 'deleted' } }).select('preferredLocale').lean() : null;
  const lang = pickLang(req.query.lang, leader?.preferredLocale);
  if (!leader) return plain(res, SAY.unknown[lang]);

  const mutha = await Mutha.findOne({ leaderId: leader._id }).select('memberIds').lean();
  const proxies = mutha ? await User.find({ _id: { $in: mutha.memberIds }, leaderManaged: true }).select('name').lean() : [];
  const jobs = proxies.length
    ? await Booking.find({ assignedHamaliIds: { $in: proxies.map((p) => p._id) }, status: { $in: ['accepted', 'in_progress'] } })
        .select('assignedHamaliIds scheduledFor pickupLocation.address createdAt')
        .sort({ scheduledFor: 1, createdAt: 1 })
        .limit(3)
        .lean()
    : [];
  if (jobs.length === 0) return plain(res, SAY.none[lang]);

  const names = new Map(proxies.map((p) => [p._id.toString(), p.name]));
  const lines = jobs.flatMap((j) =>
    j.assignedHamaliIds
      .filter((id) => names.has(id.toString()))
      .map((id) => SAY.job[lang](names.get(id.toString())!, whenSpoken(j.scheduledFor, lang), (j.pickupLocation?.address ?? '').split(',')[0].slice(0, 40) || '-'))
  );
  plain(res, lines.join(' '));
});

export const requestCallback = asyncHandler(async (req: Request, res: Response) => {
  if (!ivrAuthorised(req.query.token)) return void res.status(403).type('text/plain').send(SAY.refused);

  const digits = callerDigits(req.query.From);
  const callSid = typeof req.query.CallSid === 'string' ? req.query.CallSid.slice(0, 80) : '';
  const lang = pickLang(req.query.lang, undefined);
  if (!digits || !callSid) return plain(res, SAY.thanks[lang]);

  try {
    await CallbackRequest.create({
      phone: digits,
      callSid,
      language: lang,
      digits: typeof req.query.digits === 'string' ? req.query.digits.replace(/\D/g, '').slice(0, 10) || undefined : undefined,
    });
  } catch (err) {
    // The same call asking twice is one request.
    if ((err as { code?: number }).code !== 11000) throw err;
  }
  plain(res, SAY.thanks[lang]);
});

// ---- for the people who ring back ----

export const listCallbackRequests = asyncHandler(async (req: Request, res: Response) => {
  const status = req.query.status === 'done' ? 'done' : 'open';
  const requests = await CallbackRequest.find({ status }).sort({ createdAt: 1 }).limit(200).lean();
  res.status(200).json({ requests });
});

export const markCallbackDone = asyncHandler(async (req: Request, res: Response) => {
  const r = await CallbackRequest.findOneAndUpdate(
    { _id: req.params.id, status: 'open' },
    { status: 'done', doneByUserId: req.user!.id, doneAt: new Date() },
    { new: true }
  );
  if (!r) throw new ApiError(404, 'Callback request not found');
  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'callback_request_done',
    targetType: 'CallbackRequest',
    targetId: r._id.toString(),
    details: {},
  });
  res.status(200).json({ request: r });
});
