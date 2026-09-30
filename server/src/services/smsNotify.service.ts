import type { IBooking } from '../models/Booking';
import { User } from '../models/User';
import { Mutha } from '../models/Mutha';
import { sendSms, smsReady, type SmsLocale } from './sms.service';

/**
 * The text messages FYRO sends about a booking. Both are best effort: a
 * failure is logged and never holds up the booking, and when no SMS provider
 * is configured nothing is read or sent at all.
 *
 *   - the customer is told their booking is confirmed and who is coming
 *   - a society leader is told when a member WITHOUT a phone has been given a
 *     job, since that member cannot be told directly
 *
 * Both respect the person's own "job updates by SMS" setting.
 */
const SOON: Record<SmsLocale, string> = { en: 'soon', te: 'త్వరలో', hi: 'जल्द' };
const MONTHS: Record<SmsLocale, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  te: ['జన', 'ఫిబ్ర', 'మార్చి', 'ఏప్రి', 'మే', 'జూన్', 'జులై', 'ఆగ', 'సెప్టెం', 'అక్టో', 'నవం', 'డిసెం'],
  hi: ['जन', 'फ़र', 'मार्च', 'अप्रै', 'मई', 'जून', 'जुला', 'अग', 'सित', 'अक्टू', 'नव', 'दिस'],
};

function when(booking: Pick<IBooking, 'scheduledFor'>, locale: SmsLocale): string {
  if (!booking.scheduledFor) return SOON[locale];
  // Shown in Indian Standard Time, which is what the people reading it live in.
  const ist = new Date(new Date(booking.scheduledFor).getTime() + 5.5 * 3600_000);
  const hh = String(ist.getUTCHours()).padStart(2, '0');
  const mm = String(ist.getUTCMinutes()).padStart(2, '0');
  return `${ist.getUTCDate()} ${MONTHS[locale][ist.getUTCMonth()]} ${hh}:${mm}`;
}

const localeOf = (u: { preferredLocale?: string } | null): SmsLocale => (u?.preferredLocale === 'te' || u?.preferredLocale === 'hi' ? u.preferredLocale : 'en');

function log(what: string, reason: string) {
  // eslint-disable-next-line no-console
  console.error(`SMS (${what}) not sent: ${reason}`);
}

export async function smsBookingConfirmed(booking: IBooking): Promise<void> {
  if (!smsReady()) return;
  try {
    const customer = await User.findById(booking.customerId).select('phone preferredLocale notificationPreferences').lean();
    if (!customer || customer.notificationPreferences?.sms?.jobUpdates === false) return;
    const workerId = booking.assignedDriverIds[0] ?? booking.assignedHamaliIds[0];
    const worker = workerId ? await User.findById(workerId).select('name').lean() : null;
    const locale = localeOf(customer);
    const r = await sendSms(customer.phone, 'booking_confirmed', { WORKER: worker?.name ?? 'FYRO', WHEN: when(booking, locale) }, locale);
    if (!r.ok && r.reason !== 'not_a_mobile_number') log('booking_confirmed', r.reason);
  } catch (err) {
    log('booking_confirmed', (err as Error).message);
  }
}

/** Tells a society leader about jobs given to members who have no phone. `memberIds` are the members just assigned. */
export async function smsProxyAssignments(booking: IBooking, memberIds: { toString(): string }[]): Promise<void> {
  if (!smsReady() || memberIds.length === 0) return;
  try {
    const proxies = await User.find({ _id: { $in: memberIds }, leaderManaged: true }).select('name managedByMuthaId').lean();
    for (const m of proxies) {
      const mutha = m.managedByMuthaId ? await Mutha.findById(m.managedByMuthaId).select('leaderId').lean() : null;
      const leader = mutha ? await User.findById(mutha.leaderId).select('phone preferredLocale notificationPreferences').lean() : null;
      if (!leader || leader.notificationPreferences?.sms?.jobUpdates === false) continue;
      const locale = localeOf(leader);
      const place = (booking.pickupLocation?.address ?? '').split(',')[0].slice(0, 40) || '-';
      const r = await sendSms(leader.phone, 'proxy_assignment', { MEMBER: m.name, WHEN: when(booking, locale), PLACE: place }, locale);
      if (!r.ok && r.reason !== 'not_a_mobile_number') log('proxy_assignment', r.reason);
    }
  } catch (err) {
    log('proxy_assignment', (err as Error).message);
  }
}
