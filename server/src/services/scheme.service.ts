import { Types } from 'mongoose';
import { SchemePlan, SCHEME_CODES, type SchemeCode, type ISchemePlan } from '../models/SchemePlan';
import { SchemeEnrolment, type ISchemeEnrolment } from '../models/SchemeEnrolment';
import { User } from '../models/User';
import { Mutha } from '../models/Mutha';
import { ApiError } from '../utils/ApiError';
import { writeAuditLog, SYSTEM_ACTOR_ID } from './audit.service';
import { writeLedgerEntry } from './ledger.service';
import { poolBalance } from './welfarePool.service';
import { createNotification } from './notification.service';
import { addMonths } from './policeVerification.service';
import type { Role } from '@fyro/shared';

/**
 * PMSBY and PMJJBY: helping members into the government schemes through their
 * own bank, and paying the yearly premium from the district welfare pool.
 *
 * Enrolment here is a RECORD that the person has been helped to enrol at their
 * bank (which bank, the nominee, their consent, the bank's reference once it
 * exists). The bank holds the account and the policy. Every screen says so.
 *
 * The premium figures are never guessed. They stay empty until an admin enters
 * the published ones with a source link, and a renewal that falls due before
 * that is held, not debited. A renewal is paid only from the member's district
 * pool, only when the pool can cover it, and through the ledger.
 */
export const ENROLMENT_LABEL = "Enrolment through the member's bank";

const PLAN_NAMES: Record<SchemeCode, string> = {
  pmsby: 'Pradhan Mantri Suraksha Bima Yojana (PMSBY): accident cover',
  pmjjby: 'Pradhan Mantri Jeevan Jyoti Bima Yojana (PMJJBY): life cover',
};

type Locale = 'en' | 'te' | 'hi';
interface Actor {
  id: string;
  role: Role;
}

export async function ensurePlans(): Promise<void> {
  for (const code of SCHEME_CODES) {
    await SchemePlan.updateOne({ code }, { $setOnInsert: { code, name: PLAN_NAMES[code], premiumAnnual: null, coverageAmount: null } }, { upsert: true });
  }
}

export function planView(p: ISchemePlan) {
  return {
    code: p.code,
    name: p.name,
    premiumAnnual: p.premiumAnnual,
    coverageAmount: p.coverageAmount,
    sourceUrl: p.sourceUrl,
    sourceNote: p.sourceNote,
    // A figure without a source is treated as not set.
    premiumKnown: p.premiumAnnual != null && Boolean(p.sourceUrl),
    label: ENROLMENT_LABEL,
  };
}

export async function listPlans() {
  await ensurePlans();
  return (await SchemePlan.find({}).sort({ code: 1 }).lean()).map((p) => planView(p as never));
}

export async function setPlanFigures(
  actor: Actor,
  code: SchemeCode,
  input: { premiumAnnual: number; coverageAmount?: number; sourceUrl: string; sourceNote?: string }
) {
  if (!/^https?:\/\/\S+$/i.test(input.sourceUrl)) throw new ApiError(400, 'Give the link where these figures were read.');
  await ensurePlans();
  const plan = await SchemePlan.findOneAndUpdate(
    { code },
    {
      $set: {
        premiumAnnual: input.premiumAnnual,
        coverageAmount: input.coverageAmount ?? null,
        sourceUrl: input.sourceUrl,
        sourceNote: input.sourceNote,
        updatedByUserId: new Types.ObjectId(actor.id),
      },
    },
    { new: true }
  );
  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'scheme_plan_figures_set',
    targetType: 'SchemePlan',
    targetId: plan!._id.toString(),
    details: { code, premiumAnnual: input.premiumAnnual, coverageAmount: input.coverageAmount ?? null, sourceUrl: input.sourceUrl },
  });
  return planView(plan!.toObject());
}

export function enrolmentView(e: ISchemeEnrolment & { _id: Types.ObjectId }) {
  return {
    _id: e._id,
    scheme: e.scheme,
    status: e.status,
    bankName: e.bankName,
    accountLast4: e.accountLast4,
    nominee: e.nominee,
    consentAt: e.consentAt,
    consentOnBehalf: e.consentOnBehalf,
    bankReference: e.bankReference,
    confirmedAt: e.confirmedAt,
    renewalDate: e.renewalDate,
    premiumsPaid: e.premiums.length,
    renewalHold: e.renewalHold ? { reason: e.renewalHold.reason, since: e.renewalHold.since } : undefined,
    label: ENROLMENT_LABEL,
  };
}

/** The member a leader may act for: one of their own society's phone-less members. */
async function assertLeaderOf(actor: Actor, memberId: string): Promise<void> {
  const member = await User.findById(memberId).select('leaderManaged managedByMuthaId').lean();
  const mutha = actor.role === 'mutha_leader' ? await Mutha.findOne({ leaderId: actor.id }).select('_id').lean() : null;
  if (!member?.leaderManaged || !mutha || member.managedByMuthaId?.toString() !== mutha._id.toString()) {
    throw new ApiError(404, 'Member not found');
  }
}

async function targetFor(actor: Actor, memberId?: string): Promise<{ userId: string; onBehalf: boolean }> {
  if (!memberId || memberId === actor.id) return { userId: actor.id, onBehalf: false };
  await assertLeaderOf(actor, memberId);
  return { userId: memberId, onBehalf: true };
}

export async function enrol(
  actor: Actor,
  code: SchemeCode,
  input: {
    memberId?: string;
    bankName: string;
    accountLast4?: string;
    nominee: { name: string; relation: string };
    consent: boolean;
    bankReference?: string;
  }
) {
  if (input.consent !== true) throw new ApiError(400, 'Consent is needed to record this enrolment.');
  await ensurePlans();
  const { userId, onBehalf } = await targetFor(actor, input.memberId);
  const now = new Date();
  try {
    const e = await SchemeEnrolment.create({
      userId,
      scheme: code,
      bankName: input.bankName,
      accountLast4: input.accountLast4 || undefined,
      nominee: input.nominee,
      consentAt: now,
      consentOnBehalf: onBehalf,
      recordedByUserId: actor.id,
      ...(input.bankReference
        ? { bankReference: input.bankReference, status: 'confirmed_by_bank', confirmedAt: now, renewalDate: addMonths(now, 12) }
        : {}),
    });
    await writeAuditLog({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'scheme_enrolment_recorded',
      targetType: 'SchemeEnrolment',
      targetId: e._id.toString(),
      details: { scheme: code, memberId: userId, consentOnBehalf: onBehalf, bankName: input.bankName, confirmed: e.status === 'confirmed_by_bank' },
    });
    return enrolmentView(e);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new ApiError(409, 'This person already has an enrolment recorded for that scheme.');
    throw err;
  }
}

/** The bank has enrolled them and given a reference: the record is confirmed and the renewal clock starts. */
export async function confirmWithBank(actor: Actor, enrolmentId: string, bankReference: string) {
  const e = await SchemeEnrolment.findById(enrolmentId);
  if (!e) throw new ApiError(404, 'Enrolment not found');
  if (e.userId.toString() !== actor.id) await assertLeaderOf(actor, e.userId.toString());
  if (e.status === 'confirmed_by_bank') throw new ApiError(409, 'The bank has already confirmed this one.');
  if (e.status === 'lapsed') throw new ApiError(409, 'This enrolment has lapsed.');
  const now = new Date();
  e.bankReference = bankReference;
  e.status = 'confirmed_by_bank';
  e.confirmedAt = now;
  e.renewalDate = addMonths(now, 12);
  await e.save();
  await writeAuditLog({ actorId: actor.id, actorRole: actor.role, action: 'scheme_enrolment_bank_confirmed', targetType: 'SchemeEnrolment', targetId: e._id.toString(), details: { scheme: e.scheme } });
  return enrolmentView(e);
}

export async function listMine(userId: string) {
  return (await SchemeEnrolment.find({ userId }).sort({ createdAt: -1 }).lean()).map((e) => enrolmentView(e as never));
}

/** A leader sees the enrolments of their own society's members. */
export async function listForSociety(leaderId: string) {
  const mutha = await Mutha.findOne({ leaderId }).select('memberIds').lean();
  if (!mutha) throw new ApiError(404, 'No society found for this leader');
  const rows = await SchemeEnrolment.find({ userId: { $in: mutha.memberIds } }).sort({ createdAt: -1 }).lean();
  const users = await User.find({ _id: { $in: rows.map((r) => r.userId) } }).select('name').lean();
  const names = new Map(users.map((u) => [u._id.toString(), u.name]));
  return rows.map((r) => ({ ...enrolmentView(r as never), memberId: r.userId, memberName: names.get(r.userId.toString()) ?? '' }));
}

// ---- renewals ----

async function districtOf(userId: Types.ObjectId): Promise<{ districtId: Types.ObjectId; leaderId: Types.ObjectId; region?: string } | null> {
  const mutha = await Mutha.findOne({ $or: [{ memberIds: userId }, { leaderId: userId }] }).select('districtFederationId affiliationStatus leaderId region').lean();
  if (!mutha || mutha.affiliationStatus !== 'affiliated' || !mutha.districtFederationId) return null;
  return { districtId: mutha.districtFederationId, leaderId: mutha.leaderId, region: mutha.region };
}

export type RenewalOutcome = 'would_debit' | 'debited' | 'held_premium_not_set' | 'held_pool_insufficient' | 'held_no_district' | 'busy';

export interface RenewalResult {
  enrolmentId: string;
  scheme: SchemeCode;
  memberId: string;
  districtId?: string;
  amount: number | null;
  outcome: RenewalOutcome;
}

const MSG: Record<'renewed' | 'premium_not_set' | 'pool_insufficient' | 'no_district', Record<Locale, (scheme: string, x: { amount?: number; date: string; who: string }) => string>> = {
  renewed: {
    en: (s, x) => `Your ${s} premium of ₹${x.amount} for the year from ${x.date} was paid from the district welfare pool.`,
    te: (s, x) => `${x.date} నుండి సంవత్సరానికి మీ ${s} ప్రీమియం ₹${x.amount} జిల్లా సంక్షేమ నిధి నుండి చెల్లించబడింది.`,
    hi: (s, x) => `${x.date} से साल के लिए आपका ${s} प्रीमियम ₹${x.amount} ज़िला कल्याण कोष से चुका दिया गया।`,
  },
  premium_not_set: {
    en: (s, x) => `${s} renewal for ${x.who} is waiting: the premium figure has not been confirmed yet.`,
    te: (s, x) => `${x.who} కోసం ${s} రెన్యువల్ వేచి ఉంది: ప్రీమియం మొత్తం ఇంకా నిర్ధారించబడలేదు.`,
    hi: (s, x) => `${x.who} के लिए ${s} नवीनीकरण रुका है: प्रीमियम की रकम की अभी पुष्टि नहीं हुई है।`,
  },
  pool_insufficient: {
    en: (s, x) => `${s} renewal for ${x.who} is waiting: the district welfare pool does not have enough money yet.`,
    te: (s, x) => `${x.who} కోసం ${s} రెన్యువల్ వేచి ఉంది: జిల్లా సంక్షేమ నిధిలో తగినంత డబ్బు ఇంకా లేదు.`,
    hi: (s, x) => `${x.who} के लिए ${s} नवीनीकरण रुका है: ज़िला कल्याण कोष में अभी पर्याप्त पैसा नहीं है।`,
  },
  no_district: {
    en: (s, x) => `${s} renewal for ${x.who} is waiting: no district welfare pool covers them, because their society is not affiliated to a district.`,
    te: (s, x) => `${x.who} కోసం ${s} రెన్యువల్ వేచి ఉంది: వారి సొసైటీ జిల్లాకు అనుబంధంగా లేనందున ఏ జిల్లా సంక్షేమ నిధీ వర్తించదు.`,
    hi: (s, x) => `${x.who} के लिए ${s} नवीनीकरण रुका है: उनकी सोसाइटी किसी ज़िले से संबद्ध नहीं है, इसलिए कोई ज़िला कल्याण कोष लागू नहीं होता।`,
  },
};

const localeOf = (u: { preferredLocale?: string } | null): Locale => (u?.preferredLocale === 'te' || u?.preferredLocale === 'hi' ? u.preferredLocale : 'en');
const shortName = (code: SchemeCode) => code.toUpperCase();

async function notifyOnce(to: Types.ObjectId, kind: keyof typeof MSG, code: SchemeCode, x: { amount?: number; date: string; who: string }) {
  const user = await User.findById(to).select('preferredLocale').lean();
  await createNotification(to.toString(), 'insurance_scheme', { scheme: shortName(code), message: MSG[kind][localeOf(user)](shortName(code), x) });
}

/**
 * Pays the yearly premium for every confirmed enrolment whose renewal is due,
 * from the member's district welfare pool, through the ledger.
 *
 * dryRun computes exactly what would happen and writes nothing. A real run is
 * safe to repeat: each enrolment is claimed before it is paid, and paying moves
 * its renewal date a year on, so nothing is debited twice for the same year.
 * A renewal that cannot be paid (no premium figure, no district, or the pool
 * is too low) is held and the right person is told once.
 */
export async function runSchemeRenewals(opts: { now?: Date; dryRun?: boolean } = {}): Promise<RenewalResult[]> {
  const now = opts.now ?? new Date();
  await ensurePlans();
  const plans = new Map((await SchemePlan.find({}).lean()).map((p) => [p.code, p]));
  const due = await SchemeEnrolment.find({ status: 'confirmed_by_bank', renewalDate: { $lte: now } });
  const out: RenewalResult[] = [];
  // Within one run, earlier renewals in a district draw the pool down before later ones are checked.
  const drawn = new Map<string, number>();

  for (const e of due) {
    const plan = plans.get(e.scheme);
    const base = { enrolmentId: e._id.toString(), scheme: e.scheme, memberId: e.userId.toString() };
    const amount = plan?.premiumAnnual != null && plan.sourceUrl ? plan.premiumAnnual : null;
    const d = await districtOf(e.userId);
    const who = (await User.findById(e.userId).select('name').lean())?.name ?? '';
    const dateText = e.renewalDate!.toISOString().slice(0, 10);

    let hold: 'premium_not_set' | 'pool_insufficient' | 'no_district' | null = null;
    if (amount === null) hold = 'premium_not_set';
    else if (!d) hold = 'no_district';
    else {
      const key = d.districtId.toString();
      const available = (await poolBalance(d.districtId)) - (drawn.get(key) ?? 0);
      if (available < amount) hold = 'pool_insufficient';
    }

    if (hold) {
      out.push({ ...base, districtId: d?.districtId.toString(), amount, outcome: `held_${hold}` as RenewalOutcome });
      if (!opts.dryRun) {
        const already = e.renewalHold?.reason === hold && e.renewalHold.notifiedAt;
        e.renewalHold = { reason: hold, since: e.renewalHold?.reason === hold ? e.renewalHold.since : now, notifiedAt: already ? e.renewalHold!.notifiedAt : now };
        await e.save();
        if (!already) {
          // The member's leader (or the member, if they have no society) is the one who can act.
          await notifyOnce(d?.leaderId ?? e.userId, hold, e.scheme, { date: dateText, who });
          await writeAuditLog({ actorId: SYSTEM_ACTOR_ID, actorRole: 'system', action: 'scheme_renewal_held', targetType: 'SchemeEnrolment', targetId: e._id.toString(), details: { reason: hold } });
        }
      }
      continue;
    }

    const debit = amount as number;
    const key = d!.districtId.toString();
    if (opts.dryRun) {
      drawn.set(key, (drawn.get(key) ?? 0) + debit);
      out.push({ ...base, districtId: key, amount: debit, outcome: 'would_debit' });
      continue;
    }

    // Claim it: only one runner gets to pay this renewal.
    const claimed = await SchemeEnrolment.findOneAndUpdate(
      { _id: e._id, renewalDate: e.renewalDate, $or: [{ renewalLockAt: { $exists: false } }, { renewalLockAt: { $lt: new Date(now.getTime() - 10 * 60_000) } }] },
      { $set: { renewalLockAt: now } },
      { new: true }
    );
    if (!claimed) {
      out.push({ ...base, districtId: key, amount: debit, outcome: 'busy' });
      continue;
    }
    try {
      await writeLedgerEntry({
        type: 'scheme_premium',
        entityType: 'Federation',
        entityId: key,
        amount: debit,
        description: `${shortName(e.scheme)} annual premium for a member of the district, renewal due ${dateText}`,
        region: d!.region,
      });
      await SchemeEnrolment.updateOne(
        { _id: e._id },
        {
          $set: { renewalDate: addMonths(e.renewalDate!, 12) },
          $push: { premiums: { forRenewalDate: e.renewalDate, amount: debit, paidAt: now } },
          $unset: { renewalHold: 1, renewalLockAt: 1 },
        }
      );
    } catch (err) {
      await SchemeEnrolment.updateOne({ _id: e._id }, { $unset: { renewalLockAt: 1 } });
      throw err;
    }
    await writeAuditLog({ actorId: SYSTEM_ACTOR_ID, actorRole: 'system', action: 'scheme_premium_debited', targetType: 'SchemeEnrolment', targetId: e._id.toString(), details: { scheme: e.scheme, amount: debit, districtId: key, forRenewal: dateText } });
    await notifyOnce(e.userId, 'renewed', e.scheme, { amount: debit, date: dateText, who });
    out.push({ ...base, districtId: key, amount: debit, outcome: 'debited' });
  }
  return out;
}
