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
 */
export async function uploadImage(buffer: Buffer, folder: string): Promise<UploadResult> {
  if (env.MOCK_EXTERNAL_SERVICES || !env.CLOUDINARY_CLOUD_NAME) {
    const fakeId = `${folder}-${Date.now()}`;
    return { url: `https://mock.cloudinary.local/${fakeId}.jpg`, publicId: fakeId };
  }
  // Real integration point — wired once CLOUDINARY_* env vars are supplied.
  const cloudinary = await import('cloudinary');
  cloudinary.v2.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
  const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = cloudinary.v2.uploader.upload_stream({ folder }, (err: any, res: any) => {
      if (err || !res) reject(err);
      else resolve(res as { secure_url: string; public_id: string });
    });
    stream.end(buffer);
  });
  return { url: result.secure_url, publicId: result.public_id };
}
