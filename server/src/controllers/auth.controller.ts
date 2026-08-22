import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { publicUser } from '../utils/publicUser';
import { rethrowAsConflict } from '../utils/mongoErrors';
import { User } from '../models/User';
import { Vehicle } from '../models/Vehicle';
import { Booking } from '../models/Booking';
import { Payout } from '../models/Payout';
import { uploadImage } from '../services/cloudinary.service';
import { generateOtp, sendOtpSms, verifyOtp, OTP_MAX_ATTEMPTS } from '../services/otp.service';
import { HamaliProfile } from '../models/HamaliProfile';
import { Mutha } from '../models/Mutha';
import { Fleet } from '../models/Fleet';
import { WarehouseHub } from '../models/WarehouseHub';
import type { Role } from '@fyro/shared';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  ACCESS_TOKEN_MAX_AGE_MS,
  REFRESH_TOKEN_MAX_AGE_MS,
} from '../services/token.service';

const BCRYPT_COST = 12;

// sameSite:'strict' works fine in dev (client:3000 and server:4000 are
// different ports but the same registrable domain, localhost) but breaks
// auth entirely once client and server are on genuinely different domains
// (Vercel + Render) — a 'strict' cookie is never sent cross-site, so every
// authenticated fetch from the deployed client would silently look
// logged-out. 'none' requires secure:true (HTTPS-only), which production
// already has.
const cookieOpts = {
  httpOnly: true as const,
  secure: process.env.NODE_ENV === 'production',
  sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'strict') as 'none' | 'strict',
};

function setAuthCookies(res: Response, userId: string, role: string, tokenVersion: number) {
  const accessToken = signAccessToken({ id: userId, role: role as never });
  const refreshToken = signRefreshToken({ id: userId, tokenVersion });
  res.cookie('accessToken', accessToken, { ...cookieOpts, maxAge: ACCESS_TOKEN_MAX_AGE_MS });
  res.cookie('refreshToken', refreshToken, { ...cookieOpts, maxAge: REFRESH_TOKEN_MAX_AGE_MS });
}

export const signupCustomer = asyncHandler(async (req: Request, res: Response) => {
  const { name, phone, email, password } = req.body;
  const existing = await User.findOne({ phone });
  if (existing) throw new ApiError(409, 'Phone already registered');

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  let user;
  try {
    user = await User.create({ name, phone, email, passwordHash, role: 'customer' });
  } catch (err) {
    // The findOne check above narrows the race window but doesn't close it —
    // two concurrent signups for the same phone can both pass it.
    rethrowAsConflict(err, 'Phone number');
  }
  setAuthCookies(res, user._id.toString(), user.role, user.tokenVersion);
  res.status(201).json({ user: publicUser(user) });
});

export const signupDriver = asyncHandler(async (req: Request, res: Response) => {
  const { name, phone, password, vehicleType, capacityKg, registrationNumber } = req.body;
  const existing = await User.findOne({ phone });
  if (existing) throw new ApiError(409, 'Phone already registered');

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  let user;
  try {
    user = await User.create({ name, phone, passwordHash, role: 'driver' });
  } catch (err) {
    rethrowAsConflict(err, 'Phone number');
  }
  try {
    await Vehicle.create({
      ownerId: user._id,
      type: vehicleType,
      capacityKg,
      registrationNumber,
      verified: false,
    });
  } catch (err) {
    // registrationNumber is unique with no pre-check. Roll back the User we
    // just created so the phone isn't permanently stuck "already
    // registered" with no working profile behind it — otherwise the only
    // path forward for this phone number would be a broken account.
    await User.findByIdAndDelete(user._id);
    rethrowAsConflict(err, 'Vehicle registration number');
  }
  setAuthCookies(res, user._id.toString(), user.role, user.tokenVersion);
  res.status(201).json({ user: publicUser(user) });
});

export const signupHamali = asyncHandler(async (req: Request, res: Response) => {
  const { name, phone, password, joinType, muthaName, inviteCode } = req.body;
  const existing = await User.findOne({ phone });
  if (existing) throw new ApiError(409, 'Phone already registered');

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  if (joinType === 'solo') {
    let user;
    try {
      user = await User.create({ name, phone, passwordHash, role: 'hamali_solo' });
    } catch (err) {
      rethrowAsConflict(err, 'Phone number');
    }
    await HamaliProfile.create({ userId: user._id, type: 'solo' });
    setAuthCookies(res, user._id.toString(), user.role, user.tokenVersion);
    res.status(201).json({ user: publicUser(user) });
    return;
  }

  if (joinType === 'leader') {
    let user;
    try {
      user = await User.create({ name, phone, passwordHash, role: 'mutha_leader' });
    } catch (err) {
      rethrowAsConflict(err, 'Phone number');
    }
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const mutha = await Mutha.create({
      name: muthaName,
      leaderId: user._id,
      memberIds: [],
      inviteCode: code,
    });
    setAuthCookies(res, user._id.toString(), user.role, user.tokenVersion);
    res
      .status(201)
      .json({ user: publicUser(user), mutha: { id: mutha._id, inviteCode: mutha.inviteCode } });
    return;
  }

  if (joinType === 'member') {
    // Never trust a client-supplied muthaId — resolve it server-side from the invite code only.
    const mutha = await Mutha.findOne({ inviteCode });
    if (!mutha) throw new ApiError(400, 'Invalid invite code');

    let user;
    try {
      user = await User.create({ name, phone, passwordHash, role: 'mutha_member' });
    } catch (err) {
      rethrowAsConflict(err, 'Phone number');
    }
    await HamaliProfile.create({ userId: user._id, type: 'mutha_member', muthaId: mutha._id });
    mutha.memberIds.push(user._id);
    await mutha.save();

    setAuthCookies(res, user._id.toString(), user.role, user.tokenVersion);
    res.status(201).json({ user: publicUser(user) });
    return;
  }

  throw new ApiError(400, 'Invalid joinType');
});

export const signupFleetOwner = asyncHandler(async (req: Request, res: Response) => {
  const { name, phone, password, fleetName } = req.body;
  const existing = await User.findOne({ phone });
  if (existing) throw new ApiError(409, 'Phone already registered');

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  let user;
  try {
    user = await User.create({ name, phone, passwordHash, role: 'fleet_owner' });
  } catch (err) {
    rethrowAsConflict(err, 'Phone number');
  }
  const fleet = await Fleet.create({ ownerId: user._id, name: fleetName, vehicleIds: [], driverIds: [] });
  setAuthCookies(res, user._id.toString(), user.role, user.tokenVersion);
  res.status(201).json({ user: publicUser(user), fleet: { id: fleet._id, name: fleet.name } });
});

export const signupWarehouseHub = asyncHandler(async (req: Request, res: Response) => {
  const { name, phone, password, hubName, address } = req.body;
  const existing = await User.findOne({ phone });
  if (existing) throw new ApiError(409, 'Phone already registered');

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  let user;
  try {
    user = await User.create({ name, phone, passwordHash, role: 'warehouse_hub' });
  } catch (err) {
    rethrowAsConflict(err, 'Phone number');
  }
  const hub = await WarehouseHub.create({ ownerId: user._id, name: hubName, address: address ?? '' });
  setAuthCookies(res, user._id.toString(), user.role, user.tokenVersion);
  res.status(201).json({ user: publicUser(user), hub: { id: hub._id, name: hub.name } });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { phone, password } = req.body;
  const user = await User.findOne({ phone }).select('+passwordHash');
  if (!user || user.accountStatus !== 'active') throw new ApiError(401, 'Invalid credentials');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new ApiError(401, 'Invalid credentials');

  setAuthCookies(res, user._id.toString(), user.role, user.tokenVersion);
  res.status(200).json({ user: publicUser(user) });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;
  if (!token) throw new ApiError(401, 'No refresh token');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  const user = await User.findById(payload.id);
  if (!user || user.tokenVersion !== payload.tokenVersion) {
    throw new ApiError(401, 'Refresh token no longer valid');
  }

  // Rotate: bump version so the just-used refresh token cannot be replayed.
  user.tokenVersion += 1;
  await user.save();

  setAuthCookies(res, user._id.toString(), user.role, user.tokenVersion);
  res.status(200).json({ ok: true });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  if (req.user) {
    await User.findByIdAndUpdate(req.user.id, { $inc: { tokenVersion: 1 } });
  }
  res.clearCookie('accessToken', cookieOpts);
  res.clearCookie('refreshToken', cookieOpts);
  res.status(200).json({ ok: true });
});

// ---- PATCH /api/auth/switch-role ----
// One phone number can hold multiple roles (see User.roles). This never
// grants a new role — it only re-issues the JWT with a role the account
// already holds in roles[], so req.user.role (and every RBAC check built
// on it) reflects the switch. Client re-fetches /auth/me and re-routes.
export const switchRole = asyncHandler(async (req: Request, res: Response) => {
  const { role } = req.body as { role: Role };
  const user = await User.findById(req.user!.id);
  if (!user) throw new ApiError(401, 'User not found');
  if (!user.roles.includes(role)) {
    throw new ApiError(403, 'Forbidden: account does not hold this role');
  }
  user.role = role;
  await user.save();
  setAuthCookies(res, user._id.toString(), user.role, user.tokenVersion);
  res.status(200).json({ user: publicUser(user) });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  // req.user.id comes only from the verified JWT, never from a param/query.
  const user = await User.findById(req.user!.id);
  if (!user) throw new ApiError(401, 'User not found');
  res.status(200).json({ user: publicUser(user) });
});

// ---- PATCH /api/auth/me/photo ----
// Same base64-data-URL-in-JSON-body pattern as requests.controller's
// proof-photo upload (no multer dependency in this codebase) — every
// role's profile page gets an editable avatar out of this one endpoint.
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const updateMyPhoto = asyncHandler(async (req: Request, res: Response) => {
  const { imageBase64 } = req.body as { imageBase64: string };
  const match = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(imageBase64 ?? '');
  if (!match) throw new ApiError(400, 'imageBase64 must be a data:image/(png|jpeg|webp);base64,... URL');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.byteLength > MAX_PHOTO_BYTES) throw new ApiError(400, 'Photo too large (max 5MB)');

  const { url } = await uploadImage(buffer, `users/${req.user!.id}/avatar`);
  const user = await User.findByIdAndUpdate(req.user!.id, { profilePhoto: url }, { new: true });
  if (!user) throw new ApiError(401, 'User not found');
  res.status(200).json({ user: publicUser(user) });
});

// ---- PATCH /api/auth/me/documents ----
// Self-service until a real KYC doc-upload/verification pipeline exists —
// a driver/hamali reports their own license/insurance expiry so the
// profile page can nudge them before it lapses (see User.licenseExpiryAt
// / Vehicle.insuranceExpiryAt doc comments for why this is self-reported).
export const updateMyDocuments = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const { licenseExpiryAt, insuranceExpiryAt } = req.body as {
    licenseExpiryAt?: string;
    insuranceExpiryAt?: string;
  };

  if (licenseExpiryAt !== undefined) {
    await User.updateOne({ _id: userId }, { licenseExpiryAt: licenseExpiryAt ? new Date(licenseExpiryAt) : null });
  }
  if (insuranceExpiryAt !== undefined) {
    if (role !== 'driver') throw new ApiError(403, 'Only drivers have a vehicle insurance date');
    await Vehicle.updateOne(
      { ownerId: userId },
      { insuranceExpiryAt: insuranceExpiryAt ? new Date(insuranceExpiryAt) : null }
    );
  }

  const user = await User.findById(userId);
  const vehicle = role === 'driver' ? await Vehicle.findOne({ ownerId: userId }) : null;
  res.status(200).json({
    user: publicUser(user!),
    insuranceExpiryAt: vehicle?.insuranceExpiryAt ?? null,
  });
});

// ═══════════════════════════════════════════════════════════════════
// Phase 2 profile remediation (AUDIT_REPORT.md Section 3) — every field
// below is genuinely editable and persists to the backend, not read-only
// text. Shared across every role's profile page.
// ═══════════════════════════════════════════════════════════════════

/** PATCH /api/auth/me/profile — name and email. Phone has its own OTP-gated flow below. */
export const updateMyProfile = asyncHandler(async (req: Request, res: Response) => {
  const { name, email } = req.body as { name?: string; email?: string };
  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (email !== undefined) update.email = email;

  const user = await User.findByIdAndUpdate(req.user!.id, update, { new: true });
  if (!user) throw new ApiError(401, 'User not found');
  res.status(200).json({ user: publicUser(user) });
});

/**
 * POST /api/auth/me/phone/request-otp — starts a phone-change request. The
 * new number must not already belong to another account (same uniqueness
 * rule as signup). See otp.service.ts's doc comment for the mock/real
 * split — devOtp is only ever present in mock mode.
 */
export const requestPhoneChangeOtp = asyncHandler(async (req: Request, res: Response) => {
  const { newPhone } = req.body as { newPhone: string };

  const existing = await User.findOne({ phone: newPhone });
  if (existing) throw new ApiError(409, 'That phone number is already registered to an account');

  const { code, hash, expiresAt, devCode } = await generateOtp();
  await sendOtpSms(newPhone, code);

  await User.updateOne(
    { _id: req.user!.id },
    { pendingPhoneChange: { newPhone, otpHash: hash, expiresAt, attempts: 0 } }
  );

  res.status(200).json({ ok: true, expiresAt, devOtp: devCode });
});

/**
 * POST /api/auth/me/phone/confirm — verifies the OTP and completes the
 * phone change. Every "clear pendingPhoneChange" path below uses an
 * explicit $unset via updateOne rather than `user.pendingPhoneChange =
 * undefined; await user.save()` — the latter does NOT actually remove a
 * nested-object schema path in Mongoose, it re-materializes as
 * `{ attempts: 0 }` (attempts has `default: 0`) instead of disappearing.
 * This is the exact same failure mode as the GeoPoint willingLocation bug
 * documented elsewhere in this codebase (Vehicle.ts/HamaliProfile.ts) —
 * caught here by profileSecurity.test.ts actually asserting
 * pendingPhoneChange is gone after a successful confirm, not just that
 * phone changed.
 */
export const confirmPhoneChange = asyncHandler(async (req: Request, res: Response) => {
  const { otp } = req.body as { otp: string };
  const user = await User.findById(req.user!.id);
  if (!user) throw new ApiError(401, 'User not found');

  const pending = user.pendingPhoneChange;
  if (!pending || !pending.otpHash) throw new ApiError(400, 'No phone change is pending — request an OTP first');
  if (pending.expiresAt < new Date()) {
    await User.updateOne({ _id: user._id }, { $unset: { pendingPhoneChange: 1 } });
    throw new ApiError(400, 'This OTP has expired — request a new one');
  }
  if (pending.attempts >= OTP_MAX_ATTEMPTS) {
    await User.updateOne({ _id: user._id }, { $unset: { pendingPhoneChange: 1 } });
    throw new ApiError(429, 'Too many incorrect attempts — request a new OTP');
  }

  const valid = await verifyOtp(otp, pending.otpHash);
  if (!valid) {
    await User.updateOne({ _id: user._id }, { $inc: { 'pendingPhoneChange.attempts': 1 } });
    throw new ApiError(400, 'Incorrect code');
  }

  user.phone = pending.newPhone;
  await user.save();
  await User.updateOne({ _id: user._id }, { $unset: { pendingPhoneChange: 1 } });
  // The in-memory `user` doc still holds the pre-$unset pendingPhoneChange
  // (that update ran separately, not through this document) — clear it
  // here too purely so the response returned to the caller doesn't lie
  // about what's actually in the database.
  user.pendingPhoneChange = undefined;

  res.status(200).json({ user: publicUser(user) });
});

/**
 * PATCH /api/auth/me/password — requires the current password (same
 * verification as login) before accepting a new one. Bumps tokenVersion so
 * every other session's refresh token is invalidated at once — a password
 * change is exactly the moment you want every OTHER logged-in device
 * signed out, this session's own cookies are re-issued fresh right after
 * so the user making the change stays logged in.
 */
export const updateMyPassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  const user = await User.findById(req.user!.id).select('+passwordHash');
  if (!user) throw new ApiError(401, 'User not found');

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new ApiError(400, 'Current password is incorrect');

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  user.tokenVersion += 1;
  await user.save();

  setAuthCookies(res, user._id.toString(), user.role, user.tokenVersion);
  res.status(200).json({ ok: true });
});

const NOTIFICATION_CATEGORIES = ['jobUpdates', 'payments', 'promotions'] as const;
type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** PATCH /api/auth/me/notification-preferences — one {channel, category, enabled} triple per call. */
export const updateNotificationPreferences = asyncHandler(async (req: Request, res: Response) => {
  const { channel, category, enabled } = req.body as {
    channel: 'push' | 'sms';
    category: NotificationCategory;
    enabled: boolean;
  };
  if (!NOTIFICATION_CATEGORIES.includes(category)) throw new ApiError(400, 'Unknown notification category');

  const user = await User.findByIdAndUpdate(
    req.user!.id,
    { [`notificationPreferences.${channel}.${category}`]: enabled },
    { new: true }
  );
  if (!user) throw new ApiError(401, 'User not found');
  res.status(200).json({ notificationPreferences: user.notificationPreferences });
});

/** PATCH /api/auth/me/privacy */
export const updateMyPrivacy = asyncHandler(async (req: Request, res: Response) => {
  const { shareLocationWhileOffline, profileVisibility } = req.body as {
    shareLocationWhileOffline?: boolean;
    profileVisibility?: 'public' | 'private';
  };
  const update: Record<string, unknown> = {};
  if (shareLocationWhileOffline !== undefined) update['privacySettings.shareLocationWhileOffline'] = shareLocationWhileOffline;
  if (profileVisibility !== undefined) update['privacySettings.profileVisibility'] = profileVisibility;

  const user = await User.findByIdAndUpdate(req.user!.id, update, { new: true });
  if (!user) throw new ApiError(401, 'User not found');
  res.status(200).json({ privacySettings: user.privacySettings });
});

/**
 * PATCH /api/auth/me/payout-details — bank OR UPI. Returned value is
 * masked by publicUser (see its doc comment) — this is the only endpoint
 * that ever sees/sets the real, unmasked values.
 */
export const updateMyPayoutDetails = asyncHandler(async (req: Request, res: Response) => {
  const { method, accountHolderName, bankAccountNumber, ifsc, upiId } = req.body as {
    method: 'bank' | 'upi';
    accountHolderName?: string;
    bankAccountNumber?: string;
    ifsc?: string;
    upiId?: string;
  };

  if (method === 'bank' && (!accountHolderName || !bankAccountNumber || !ifsc)) {
    throw new ApiError(400, 'Bank transfer requires accountHolderName, bankAccountNumber, and ifsc');
  }
  if (method === 'upi' && !upiId) {
    throw new ApiError(400, 'UPI requires upiId');
  }

  const payoutDetails =
    method === 'bank'
      ? { method, accountHolderName, bankAccountNumber, ifsc, updatedAt: new Date() }
      : { method, upiId, updatedAt: new Date() };

  const user = await User.findByIdAndUpdate(req.user!.id, { payoutDetails }, { new: true });
  if (!user) throw new ApiError(401, 'User not found');
  res.status(200).json({ user: publicUser(user) });
});

/**
 * DELETE /api/auth/me — soft delete (accountStatus:'deleted', login already
 * rejects any non-'active' account — see the login handler above). Blocked
 * while the account has a real financial or operational stake still in
 * flight: an open booking (as customer or as an assigned worker) or a
 * pending/approved payout — deleting an account mid-booking or mid-payout
 * would strand the other side of that transaction with no counterparty.
 */
export const deleteMyAccount = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const openStatus = { $in: ['requested', 'searching', 'matched', 'accepted', 'in_progress'] };

  const [openAsCustomer, openAsWorker, pendingPayout] = await Promise.all([
    Booking.exists({ customerId: userId, status: openStatus }),
    Booking.exists({
      status: openStatus,
      $or: [{ assignedDriverIds: userId }, { assignedHamaliIds: userId }],
    }),
    Payout.exists({ userId, status: { $in: ['pending', 'approved'] } }),
  ]);

  if (openAsCustomer || openAsWorker) {
    throw new ApiError(409, 'You have a booking in progress — finish or cancel it before deleting your account');
  }
  if (pendingPayout) {
    throw new ApiError(409, 'You have a payout awaiting approval or payment — this must be settled before deleting your account');
  }

  const user = await User.findByIdAndUpdate(userId, { accountStatus: 'deleted' }, { new: true });
  if (!user) throw new ApiError(401, 'User not found');

  res.clearCookie('accessToken', cookieOpts);
  res.clearCookie('refreshToken', cookieOpts);
  res.status(200).json({ ok: true });
});
