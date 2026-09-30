import { ApiError } from '../utils/ApiError';
import { uploadPrivateDocument, signedDocumentUrl } from './cloudinary.service';

/**
 * A supporting document (an e-Shram card, a police verification certificate)
 * stored the same way KYC documents are: privately, reachable only through a
 * short-lived signed link minted per view, never as a URL.
 */
export const MAX_CREDENTIAL_BYTES = 8 * 1024 * 1024;

export interface StoredCredentialFile {
  publicId: string;
  format: string;
  resourceType: 'image' | 'raw';
  uploadedAt: Date;
}

export async function storeCredentialFile(folder: string, fileBase64: string): Promise<StoredCredentialFile> {
  const match = /^data:(image\/(png|jpe?g|webp)|application\/pdf);base64,(.+)$/.exec(fileBase64 ?? '');
  if (!match) throw new ApiError(400, 'fileBase64 must be a data:image/(png|jpeg|webp) or data:application/pdf base64 URL');
  const buffer = Buffer.from(match[3], 'base64');
  if (buffer.byteLength === 0) throw new ApiError(400, 'File is empty');
  if (buffer.byteLength > MAX_CREDENTIAL_BYTES) throw new ApiError(400, 'File too large (max 8MB)');

  const resourceType = match[1] === 'application/pdf' ? 'raw' : 'image';
  const stored = await uploadPrivateDocument(buffer, folder, resourceType);
  // A mock upload stores nothing; recording a document that does not exist
  // would put nothing in front of a reviewer, so outside tests it is refused.
  if (stored.mock && process.env.NODE_ENV !== 'test') {
    throw new ApiError(503, 'Document storage is not configured, so documents cannot be accepted right now. Please try again later.');
  }
  return { publicId: stored.publicId, format: stored.format, resourceType: stored.resourceType, uploadedAt: new Date() };
}

export async function credentialFileLink(file: Pick<StoredCredentialFile, 'publicId' | 'format' | 'resourceType'>) {
  return signedDocumentUrl({ publicId: file.publicId, format: file.format, resourceType: file.resourceType });
}
