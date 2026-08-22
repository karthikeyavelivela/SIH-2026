import PDFDocument from 'pdfkit';
import { IBooking } from '../models/Booking';
import { ILoadManifest } from '../models/LoadManifest';

/**
 * Phase 6 — real Bill of Lading PDF, generated server-side from the exact
 * same LoadManifest/Booking records the manifest screen already shows and
 * signs (loadManifest.controller.ts). No fabricated fields — a signature
 * image is embedded only when the manifest is genuinely 'signed'; a
 * 'pending' manifest renders with a plain "NOT YET SIGNED" watermark line
 * instead of a fake signature block.
 */
export async function generateBolPdf(manifest: ILoadManifest, booking: IBooking): Promise<Buffer> {
  // Fetched BEFORE opening the Promise executor below — pdfkit's document
  // stream is synchronous once started, so any async work (the signature
  // image fetch) has to resolve first rather than inside an async Promise
  // executor (which silently swallows rejections).
  let signatureImageBuffer: Buffer | null = null;
  if (manifest.status === 'signed' && manifest.signatureImageUrl && !manifest.signatureImageUrl.includes('mock.cloudinary.local')) {
    try {
      const res = await fetch(manifest.signatureImageUrl);
      if (res.ok) signatureImageBuffer = Buffer.from(await res.arrayBuffer());
    } catch {
      // Best-effort — falls back to a text line in the PDF below.
    }
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const bookingRef = booking._id.toString().slice(-8).toUpperCase();

    doc.fontSize(20).font('Helvetica-Bold').text('FYRO', { continued: true });
    doc.fontSize(12).font('Helvetica').text('  Bill of Lading', { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#666666').text(`Reference: BOL-${bookingRef}`);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`);
    doc.fillColor('#000000');
    doc.moveDown(1);

    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.8);

    doc.fontSize(11).font('Helvetica-Bold').text('Consignor');
    doc.font('Helvetica').fontSize(10);
    doc.text(manifest.consignorDetails.name || '—');
    doc.text(manifest.consignorDetails.address || booking.pickupLocation.address);
    doc.moveDown(0.8);

    doc.fontSize(11).font('Helvetica-Bold').text('Route');
    doc.font('Helvetica').fontSize(10);
    doc.text(`Pickup: ${booking.pickupLocation.address}`);
    doc.text(`Drop: ${booking.dropLocation.address}`);
    if (booking.distanceKm) doc.text(`Distance: ${booking.distanceKm.toFixed(1)} km`);
    doc.moveDown(0.8);

    doc.fontSize(11).font('Helvetica-Bold').text('Cargo manifest');
    doc.moveDown(0.3);

    const colX = { sku: 50, desc: 150, qty: 380, weight: 440 };
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('SKU', colX.sku, doc.y, { width: 95 });
    doc.text('Description', colX.desc, doc.y, { width: 220 });
    const headerY = doc.y - 10;
    doc.text('Qty', colX.qty, headerY, { width: 50 });
    doc.text('Weight (kg)', colX.weight, headerY, { width: 90 });
    doc.moveDown(0.2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.3);

    doc.font('Helvetica').fontSize(9);
    let totalWeight = 0;
    for (const item of manifest.lineItems) {
      const rowY = doc.y;
      doc.text(item.sku, colX.sku, rowY, { width: 95 });
      doc.text(item.description || '—', colX.desc, rowY, { width: 220 });
      doc.text(String(item.quantity), colX.qty, rowY, { width: 50 });
      doc.text(item.weightKg.toFixed(1), colX.weight, rowY, { width: 90 });
      totalWeight += item.weightKg * item.quantity;
      doc.moveDown(0.5);
    }
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(9).text(`Total weight: ${totalWeight.toFixed(1)} kg`, 50);
    doc.moveDown(1.2);

    doc.fontSize(11).font('Helvetica-Bold').text('Sign-off');
    doc.moveDown(0.3);
    if (manifest.status === 'signed' && manifest.signatureImageUrl) {
      doc.font('Helvetica').fontSize(9).fillColor('#666666');
      doc.text(`Signed ${manifest.signedAt ? new Date(manifest.signedAt).toLocaleString('en-IN') : ''}`);
      doc.fillColor('#000000');

      if (signatureImageBuffer) {
        doc.image(signatureImageBuffer, { width: 180, height: 80 });
      } else {
        doc.fontSize(9).fillColor('#666666').text('(Signature on file — image not available in this render.)');
        doc.fillColor('#000000');
      }
    } else {
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#b45309');
      doc.text('NOT YET SIGNED — this is a draft manifest, not a completed Bill of Lading.');
      doc.fillColor('#000000');
    }

    doc.end();
  });
}
