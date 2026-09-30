import { Types } from 'mongoose';
import { EShramRecord } from '../models/EShramRecord';
import { ApiError } from '../utils/ApiError';
import { writeAuditLog } from './audit.service';
import { storeCredentialFile, credentialFileLink } from './credentialFile.service';
import type { Role } from '@fyro/shared';

/** The UAN is an identifier: it is never shown in full once recorded, only its last four digits. */
export const maskUan = (uan: string) => `${'•'.repeat(8)}${uan.slice(-4)}`;

export async function getMyEShram(userId: string) {
  const r = await EShramRecord.findOne({ userId }).lean();
  return r
    ? { registered: true, uanMasked: maskUan(r.uan), hasCard: Boolean(r.card), updatedAt: r.updatedAt }
    : { registered: false, hasCard: false };
}

export async function setUan(userId: string, role: Role, uan: string) {
  const rec = await EShramRecord.findOneAndUpdate({ userId }, { $set: { uan } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  await writeAuditLog({ actorId: userId, actorRole: role, action: 'eshram_uan_recorded', targetType: 'User', targetId: userId, details: { last4: uan.slice(-4) } });
  return { registered: true, uanMasked: maskUan(rec.uan), hasCard: Boolean(rec.card), updatedAt: rec.updatedAt };
}

export async function setCard(userId: string, role: Role, fileBase64: string) {
  const rec = await EShramRecord.findOne({ userId });
  if (!rec) throw new ApiError(409, 'Record your e-Shram number first, then add the card.');
  rec.card = await storeCredentialFile(`eshram/${userId}`, fileBase64);
  await rec.save();
  await writeAuditLog({ actorId: userId, actorRole: role, action: 'eshram_card_uploaded', targetType: 'User', targetId: userId, details: {} });
  return { registered: true, uanMasked: maskUan(rec.uan), hasCard: true, updatedAt: rec.updatedAt };
}

export async function myCardLink(userId: string) {
  const rec = await EShramRecord.findOne({ userId }).lean();
  if (!rec?.card) throw new ApiError(404, 'No e-Shram card on file');
  const link = await credentialFileLink(rec.card);
  return { url: link.url, expiresAt: link.expiresAt };
}

/** How many of these people have recorded a UAN. Recorded, not verified: see the model. */
export async function eShramCoverage(memberIds: Types.ObjectId[]) {
  const registered = memberIds.length ? await EShramRecord.countDocuments({ userId: { $in: memberIds } }) : 0;
  return { registered, total: memberIds.length, pct: memberIds.length ? Math.round((registered / memberIds.length) * 1000) / 10 : 0 };
}
