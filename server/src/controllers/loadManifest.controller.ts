import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Booking } from '../models/Booking';
import { LoadManifest } from '../models/LoadManifest';
import { uploadImage } from '../services/cloudinary.service';
import { writeAuditLog } from '../services/audit.service';
import { generateBolPdf } from '../services/bolPdf.service';
import type { Role } from '@fyro/shared';

// Only the driver assigned to the booking may read or sign its manifest —
// checked against Booking.assignedDriverIds (never trusted from the URL/
// body), same pattern as requests.controller's assertAssignedToBooking.
async function assertAssignedDriver(bookingId: string, userId: string) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found');
  const isAssignedDriver = booking.assignedDriverIds.some((id) => id.toString() === userId);
  if (!isAssignedDriver) throw new ApiError(403, 'You are not the assigned driver for this booking');
  return booking;
}

// ---- GET /api/load-manifests/:bookingId ----
// Create-on-first-read: the first time the assigned driver opens the
// manifest screen for a booking, a 'pending' manifest is created with line
// items derived from the booking's cargoDetails (a single line summarizing
// the whole cargo — Booking has no per-SKU breakdown to seed from). Every
// later GET just returns the same document. A separate POST-to-create
// endpoint would only add a round-trip the client would have to know to
// make first; this way the manifest screen has exactly one request to make
// on load, and the immutability guarantee (see signManifest) lives entirely
// in the sign path regardless of how the pending document came to exist.
export const getOrCreateManifest = asyncHandler(async (req: Request, res: Response) => {
  const { bookingId } = req.params;
  const booking = await assertAssignedDriver(bookingId, req.user!.id);

  let manifest = await LoadManifest.findOne({ bookingId });
  if (!manifest) {
    manifest = await LoadManifest.create({
      bookingId,
      lineItems: [
        {
          sku: `CARGO-${booking._id.toString().slice(-6).toUpperCase()}`,
          description: booking.cargoDetails.description || 'General cargo',
          weightKg: booking.cargoDetails.weightKg,
          quantity: 1,
        },
      ],
      consignorDetails: {
        name: '',
        address: booking.pickupLocation.address,
        phone: '',
      },
      status: 'pending',
    });
  }

  res.status(200).json({ manifest });
});

// ---- POST /api/load-manifests/:bookingId/sign ----
// Signing is a one-way transition: 'pending' -> 'signed', signatureImageUrl
// and signedAt set together, then never touched again. This is a real
// legal-artifact rule (Bill of Lading sign-off), not a soft convention —
// re-signing or re-uploading over an already-signed manifest is rejected
// with 409, full stop.
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024; // generous for a compressed line-art PNG signature pad

export const signManifest = asyncHandler(async (req: Request, res: Response) => {
  const { bookingId } = req.params;
  const userId = req.user!.id;
  await assertAssignedDriver(bookingId, userId);

  const { signatureImageBase64 } = req.body as { signatureImageBase64: string };
  const match = /^data:image\/png;base64,(.+)$/.exec(signatureImageBase64 ?? '');
  if (!match) throw new ApiError(400, 'signatureImageBase64 must be a data:image/png;base64,... string');
  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.byteLength === 0) throw new ApiError(400, 'Signature image is empty');
  if (buffer.byteLength > MAX_SIGNATURE_BYTES) throw new ApiError(400, 'Signature image too large (max 2MB)');

  const manifest = await LoadManifest.findOne({ bookingId });
  if (!manifest) throw new ApiError(404, 'Load manifest not found — GET it first to create it');
  if (manifest.status === 'signed') {
    throw new ApiError(409, 'This load manifest is already signed and cannot be modified');
  }

  const { url } = await uploadImage(buffer, `bookings/${bookingId}/manifest-signature`);

  manifest.signatureImageUrl = url;
  manifest.signedAt = new Date();
  manifest.status = 'signed';
  await manifest.save();

  await writeAuditLog({
    actorId: userId,
    actorRole: req.user!.role as Role,
    action: 'load_manifest.sign',
    targetType: 'LoadManifest',
    targetId: manifest._id.toString(),
    details: { bookingId },
  });

  res.status(200).json({ manifest });
});

// ---- GET /api/load-manifests/:bookingId/pdf ----
// Real Bill of Lading PDF, built from this exact manifest/booking record
// (bolPdf.service.ts) — same access rule as every other manifest route
// (assigned driver only). Renders whether the manifest is 'pending' or
// 'signed'; a pending one is watermarked "NOT YET SIGNED" rather than
// pretending to be a finished legal document.
export const downloadManifestPdf = asyncHandler(async (req: Request, res: Response) => {
  const { bookingId } = req.params;
  const booking = await assertAssignedDriver(bookingId, req.user!.id);

  const manifest = await LoadManifest.findOne({ bookingId });
  if (!manifest) throw new ApiError(404, 'Load manifest not found — GET it first to create it');

  const pdfBuffer = await generateBolPdf(manifest, booking);

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role as Role,
    action: 'load_manifest.download_pdf',
    targetType: 'LoadManifest',
    targetId: manifest._id.toString(),
    details: { bookingId, manifestStatus: manifest.status },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="BOL-${bookingId.slice(-8)}.pdf"`);
  res.status(200).send(pdfBuffer);
});
