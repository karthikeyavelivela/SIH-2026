import bcrypt from 'bcrypt';
import { env } from '../config/env';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { writeAuditLog } from './audit.service';
import { generateOtp, sendOtpSms, verifyOtp, OTP_MAX_ATTEMPTS } from './otp.service';
import { smsReady, sendSms, type SmsLocale } from './sms.service';

/**
 * Forgot password, by a code sent to the phone on the account.
 *
 * Available only when a code can really reach the person: an SMS provider is
 * configured, or (development only) mock codes are on. Otherwise the screen
 * says so and points to the people who can help, rather than collecting a
 * phone number and doing nothing.
 *
 * Starting a reset answers the same way whether or not the number has an
 * account, so it cannot be used to find out who is registered. Finishing it
 * changes the password and signs the account out everywhere.
 */
const RESEND_AFTER_MS = 60_000;
const BCRYPT_COST = 12;

export function resetAvailable(): boolean {
  return smsReady() || (env.MOCK_OTP === true && env.NODE_ENV !== 'production');
}

export async function startPasswordReset(phone: string): Promise<{ expiresAt?: Date; devOtp?: string }> {
  if (!resetAvailable()) throw new ApiError(503, 'Password reset by SMS is not available yet. Ask your society leader or contact support for help.');

  const user = await User.findOne({ phone, accountStatus: { $ne: 'deleted' } }).select('+passwordHash');
  // Nothing to send for an unknown number or a member with no phone; the
  // caller still gets the same success, so this cannot be probed.
  if (!user || phone.startsWith('proxy-')) return {};
  if (user.pendingPasswordReset?.requestedAt && Date.now() - user.pendingPasswordReset.requestedAt.getTime() < RESEND_AFTER_MS) return {};

  const otp = await generateOtp();
  user.pendingPasswordReset = { otpHash: otp.hash, expiresAt: otp.expiresAt, attempts: 0, requestedAt: new Date() };
  await user.save();

  if (env.MOCK_OTP) {
    // Mock mode sends nothing; development gets the code back to test with.
    return { expiresAt: otp.expiresAt, devOtp: otp.devCode };
  }
  const locale = (user.preferredLocale as SmsLocale | undefined) ?? 'en';
  const sent = await sendSms(phone, 'password_reset', { OTP: otp.code }, locale);
  if (!sent.ok) {
    // eslint-disable-next-line no-console
    console.error(`password reset SMS failed: ${sent.reason}`);
    throw new ApiError(502, 'We could not send the code just now. Please try again in a few minutes.');
  }
  return { expiresAt: otp.expiresAt };
}

export async function completePasswordReset(phone: string, code: string, newPassword: string): Promise<void> {
  const user = await User.findOne({ phone, accountStatus: { $ne: 'deleted' } });
  const pending = user?.pendingPasswordReset;
  // One message for every way this can fail, so nothing is learned from it.
  const refuse = () => new ApiError(400, 'That code is not right, or it has expired. Ask for a new one.');
  // A nested path reads back as an empty object when nothing is pending, so
  // "is there a reset" means "is there a code hash", not "is it truthy".
  if (!user || !pending?.otpHash || !pending.expiresAt || pending.expiresAt < new Date() || (pending.attempts ?? 0) >= OTP_MAX_ATTEMPTS) throw refuse();

  if (!(await verifyOtp(code, pending.otpHash))) {
    user.pendingPasswordReset = { ...pending, attempts: (pending.attempts ?? 0) + 1 };
    await user.save();
    throw refuse();
  }

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  user.tokenVersion = (user.tokenVersion ?? 0) + 1; // signs the account out everywhere
  user.pendingPasswordReset = undefined;
  await user.save();
  await writeAuditLog({
    actorId: user._id.toString(),
    actorRole: user.role,
    action: 'password_reset_by_sms',
    targetType: 'User',
    targetId: user._id.toString(),
    details: {},
  });
}

// Re-export so the OTP sender and the reset share one place that knows the limit.
export { sendOtpSms };
