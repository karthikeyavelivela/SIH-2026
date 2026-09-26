import { User } from '../models/User';
import { copyToPrivate, destroyAsset } from './cloudinary.service';
import { writeAuditLog, SYSTEM_ACTOR_ID } from './audit.service';

export interface KycMigrationItem {
  userId: string;
  documentId: string;
  type: string;
  action: 'would_migrate' | 'migrated' | 'skipped_unfetchable' | 'failed';
  reason?: string;
}

/**
 * Parses a public Cloudinary delivery URL:
 *   https://res.cloudinary.com/<cloud>/<resource_type>/upload/[<transforms>/]v<version>/<public_id>[.<ext>]
 * Image public ids exclude the extension; raw ones include it.
 */
export function parseCloudinaryUrl(url: string): { resourceType: 'image' | 'raw'; publicId: string } | null {
  const m = /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|raw)\/upload\/(?:.*?\/)?v\d+\/(.+)$/.exec(url);
  if (!m) return null;
  const resourceType = m[1] as 'image' | 'raw';
  const path = decodeURIComponent(m[2]);
  return { resourceType, publicId: resourceType === 'image' ? path.replace(/\.[a-z0-9]+$/i, '') : path };
}

/**
 * Moves every publicly stored KYC document to private ('authenticated')
 * storage: copy, point the record at the copy, delete the public original,
 * audit. Dry run (the default) only reports what it would do.
 *
 * Order matters for safety: the record is updated only after the private
 * copy exists, and the public original is deleted only after the record
 * points at the copy. A failure part-way leaves a document still reachable
 * the old way, never lost.
 */
export async function migrateKycToPrivate(opts: { apply: boolean }): Promise<KycMigrationItem[]> {
  const users = await User.find({ 'kycDocs.0': { $exists: true } }).select('kycDocs');
  const out: KycMigrationItem[] = [];

  for (const user of users) {
    for (const doc of user.kycDocs) {
      if (doc.delivery === 'authenticated') continue;
      const base = { userId: user._id.toString(), documentId: doc._id.toString(), type: doc.type };
      const parsed = parseCloudinaryUrl(doc.url);
      if (!parsed) {
        out.push({ ...base, action: 'skipped_unfetchable', reason: 'not a public Cloudinary URL (e.g. a mock upload)' });
        continue;
      }
      if (!opts.apply) {
        out.push({ ...base, action: 'would_migrate' });
        continue;
      }
      try {
        const copy = await copyToPrivate(doc.url, `kyc/${user._id}/${doc.type}`, parsed.resourceType);
        doc.url = `cloudinary-private://${copy.publicId}`;
        doc.publicId = copy.publicId;
        doc.format = copy.format;
        doc.resourceType = copy.resourceType;
        doc.delivery = 'authenticated';
        await user.save();
        await destroyAsset(parsed.publicId, parsed.resourceType, 'upload');
        await writeAuditLog({
          actorId: SYSTEM_ACTOR_ID,
          actorRole: 'system',
          action: 'kyc_document_made_private',
          targetType: 'User',
          targetId: user._id.toString(),
          details: { documentId: doc._id.toString(), type: doc.type, oldPublicId: parsed.publicId, newPublicId: copy.publicId },
        });
        out.push({ ...base, action: 'migrated' });
      } catch (err) {
        out.push({ ...base, action: 'failed', reason: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  return out;
}
