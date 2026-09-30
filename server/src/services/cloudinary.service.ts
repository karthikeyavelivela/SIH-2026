import { env } from '../config/env';

export interface UploadResult {
  url: string;
  publicId: string;
  /**
   * True when nothing was actually stored and `url` points at the
   * deterministic fake host.
   *
   * Callers that merely record the URL can ignore this. Callers that will
   * RENDER it to someone must not: a mock URL shown as an image is a broken
   * image, and a broken image is a worse answer than no image. Scan and
   * Diagnose checks it before attaching a photo to a booking.
   */
  mock: boolean;
}

/**
 * Uploads a file buffer to Cloudinary. Behind MOCK_UPLOADS=true
 * (the Phase 1 default) this returns a deterministic fake URL instead of
 * calling the real API, so the rest of the codebase can be written against
 * the real integration shape before Cloudinary credentials exist.
 *
 * `resourceType` defaults to 'image' (every existing caller — proof photos,
 * manifest signatures — is one). KYC document upload (kycDocument.controller.ts)
 * passes 'raw' for a PDF: Cloudinary's image pipeline rejects non-image
 * bytes outright, so this would silently fail on a real PDF upload without it.
 */
export async function uploadImage(
  buffer: Buffer,
  folder: string,
  resourceType: 'image' | 'raw' = 'image'
): Promise<UploadResult> {
  if (env.MOCK_UPLOADS || !env.CLOUDINARY_CLOUD_NAME) {
    const fakeId = `${folder}-${Date.now()}`;
    const ext = resourceType === 'raw' ? 'pdf' : 'jpg';
    return { url: `https://mock.cloudinary.local/${fakeId}.${ext}`, publicId: fakeId, mock: true };
  }
  // Real integration point — wired once CLOUDINARY_* env vars are supplied.
  const cloudinary = await import('cloudinary');
  cloudinary.v2.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
  const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const stream = cloudinary.v2.uploader.upload_stream({ folder, resource_type: resourceType }, (err, res) => {
      if (err || !res) reject(err);
      else resolve(res as { secure_url: string; public_id: string });
    });
    stream.end(buffer);
  });
  return { url: result.secure_url, publicId: result.public_id, mock: false };
}

/* ------------------------------------------------ private documents (KYC) */

export interface PrivateUploadResult {
  publicId: string;
  format: string;
  resourceType: 'image' | 'raw';
  mock: boolean;
}

async function sdk() {
  const cloudinary = await import('cloudinary');
  cloudinary.v2.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
  return cloudinary.v2;
}

/**
 * Stores an identity document so that no URL to it is public.
 *
 * Cloudinary's default delivery type 'upload' serves an asset to anyone who
 * has its URL, and a URL is exactly what ends up in logs, screenshots and
 * browser history. Aadhaar and PAN images must not work that way.
 * 'authenticated' assets can only be fetched with a signed, expiring URL,
 * minted per view by signedDocumentUrl below.
 */
export async function uploadPrivateDocument(
  buffer: Buffer,
  folder: string,
  resourceType: 'image' | 'raw' = 'image'
): Promise<PrivateUploadResult> {
  if (env.MOCK_UPLOADS || !env.CLOUDINARY_CLOUD_NAME) {
    return { publicId: `${folder}/mock-${Date.now()}`, format: resourceType === 'raw' ? 'pdf' : 'jpg', resourceType, mock: true };
  }
  const c = await sdk();
  const res = await new Promise<{ public_id: string; format?: string }>((resolve, reject) => {
    const stream = c.uploader.upload_stream({ folder, resource_type: resourceType, type: 'authenticated' }, (err, r) => {
      if (err || !r) reject(err);
      else resolve(r as { public_id: string; format?: string });
    });
    stream.end(buffer);
  });
  return { publicId: res.public_id, format: res.format ?? (resourceType === 'raw' ? '' : 'jpg'), resourceType, mock: false };
}

/** Re-uploads an existing (public) asset as a private one — the KYC migration. */
export async function copyToPrivate(
  sourceUrl: string,
  folder: string,
  resourceType: 'image' | 'raw'
): Promise<PrivateUploadResult> {
  const c = await sdk();
  const res = (await c.uploader.upload(sourceUrl, { folder, resource_type: resourceType, type: 'authenticated' })) as {
    public_id: string;
    format?: string;
  };
  return { publicId: res.public_id, format: res.format ?? '', resourceType, mock: false };
}

/** Deletes an asset. `type` is the delivery type it was stored under. */
export async function destroyAsset(publicId: string, resourceType: 'image' | 'raw', type: 'upload' | 'authenticated'): Promise<void> {
  const c = await sdk();
  await c.uploader.destroy(publicId, { resource_type: resourceType, type, invalidate: true });
}

export const SIGNED_URL_TTL_SECONDS = 300;

/**
 * A URL to a private document that stops working after `ttlSeconds`.
 * Uses Cloudinary's API download endpoint, which checks both the signature
 * and the expiry on every request.
 */
export async function signedDocumentUrl(
  doc: { publicId: string; format?: string; resourceType?: 'image' | 'raw' },
  ttlSeconds = SIGNED_URL_TTL_SECONDS
): Promise<{ url: string; expiresAt: Date; mock: boolean }> {
  const expiresAtSec = Math.floor(Date.now() / 1000) + ttlSeconds;
  if (env.MOCK_UPLOADS || !env.CLOUDINARY_CLOUD_NAME) {
    return {
      url: `https://mock.cloudinary.local/signed/${encodeURIComponent(doc.publicId)}?expires_at=${expiresAtSec}`,
      expiresAt: new Date(expiresAtSec * 1000),
      mock: true,
    };
  }
  const c = await sdk();
  const url = c.utils.private_download_url(doc.publicId, doc.format ?? '', {
    resource_type: doc.resourceType ?? 'image',
    type: 'authenticated',
    expires_at: expiresAtSec,
  });
  return { url, expiresAt: new Date(expiresAtSec * 1000), mock: false };
}
