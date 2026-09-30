import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { User } from '../models/User';
import { writeAuditLog } from '../services/audit.service';
import { loadTrustedKeys, offlineKycEnabled, verifyOfflineKycZip } from '../services/aadhaarOfflineKyc.service';

/** What the person may see of their own result. Never anything from the file itself. */
function view(u: { aadhaarOfflineKyc?: { last4: string; nameMatch: string; verifiedAt: Date } | null }) {
  const k = u.aadhaarOfflineKyc;
  return k ? { verified: true, last4: k.last4, nameMatch: k.nameMatch, verifiedAt: k.verifiedAt } : { verified: false };
}

/** GET — is the feature on, and has this account done it. Lets the screen explain itself when it is off. */
export const offlineKycStatus = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id).select('aadhaarOfflineKyc').lean();
  if (!user) throw new ApiError(401, 'User not found');
  res.status(200).json({ enabled: offlineKycEnabled(), ready: offlineKycEnabled() && loadTrustedKeys().length > 0, ...view(user) });
});

/**
 * POST — the zip (as a data URL) and the share phrase the person chose when
 * they downloaded it. Both are used once, here, and neither is stored or
 * logged. Only the outcome is kept.
 */
export const submitOfflineKyc = asyncHandler(async (req: Request, res: Response) => {
  if (!offlineKycEnabled()) throw new ApiError(503, 'Aadhaar offline e-KYC is not switched on yet.');
  const { fileBase64, shareCode } = req.body as { fileBase64: string; shareCode: string };

  const user = await User.findById(req.user!.id);
  if (!user) throw new ApiError(401, 'User not found');
  if (user.aadhaarOfflineKyc) throw new ApiError(409, 'Your Aadhaar offline e-KYC is already done.');

  const match = /^data:(?:application\/(?:zip|x-zip-compressed|octet-stream));base64,(.+)$/.exec(fileBase64 ?? '');
  if (!match) throw new ApiError(400, 'fileBase64 must be a data:application/zip base64 URL');

  const outcome = await verifyOfflineKycZip(Buffer.from(match[1], 'base64'), shareCode, { name: user.name });

  // One file verifies one account. A reference id already on another account
  // means the same file is being reused.
  const taken = await User.exists({ _id: { $ne: user._id }, 'aadhaarOfflineKyc.referenceId': outcome.referenceId });
  if (taken) throw new ApiError(409, 'This file has already been used for another account.');

  user.aadhaarOfflineKyc = {
    referenceId: outcome.referenceId,
    last4: outcome.last4,
    xmlTimestamp: outcome.xmlTimestamp,
    nameMatch: outcome.nameMatch,
    certificateFingerprint: outcome.certificateFingerprint,
    verifiedAt: new Date(),
  };
  try {
    await user.save();
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new ApiError(409, 'This file has already been used for another account.');
    throw err;
  }

  await writeAuditLog({
    actorId: user._id.toString(),
    actorRole: user.role,
    action: 'aadhaar_offline_ekyc_verified',
    targetType: 'User',
    targetId: user._id.toString(),
    details: { last4: outcome.last4, nameMatch: outcome.nameMatch },
  });

  res.status(200).json({ enabled: true, ...view(user) });
});
