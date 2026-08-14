import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { publicUser } from '../utils/publicUser';
import { rethrowAsConflict } from '../utils/mongoErrors';
import { User } from '../models/User';
import { Vehicle } from '../models/Vehicle';
import { HamaliProfile } from '../models/HamaliProfile';
import { Mutha } from '../models/Mutha';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  ACCESS_TOKEN_MAX_AGE_MS,
  REFRESH_TOKEN_MAX_AGE_MS,
} from '../services/token.service';

const BCRYPT_COST = 12;

const cookieOpts = {
  httpOnly: true as const,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
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

export const me = asyncHandler(async (req: Request, res: Response) => {
  // req.user.id comes only from the verified JWT, never from a param/query.
  const user = await User.findById(req.user!.id);
  if (!user) throw new ApiError(401, 'User not found');
  res.status(200).json({ user: publicUser(user) });
});
