import { env } from '../config/env';

export interface UploadResult {
  url: string;
  publicId: string;
}

/**
 * Uploads a file buffer to Cloudinary. Behind MOCK_EXTERNAL_SERVICES=true
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
  if (env.MOCK_EXTERNAL_SERVICES || !env.CLOUDINARY_CLOUD_NAME) {
    const fakeId = `${folder}-${Date.now()}`;
    const ext = resourceType === 'raw' ? 'pdf' : 'jpg';
    return { url: `https://mock.cloudinary.local/${fakeId}.${ext}`, publicId: fakeId };
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
  return { url: result.secure_url, publicId: result.public_id };
}
