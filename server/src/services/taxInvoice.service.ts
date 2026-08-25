import PDFDocument from 'pdfkit';
import { IBooking } from '../models/Booking';
import { IUser } from '../models/User';
import { IPayment } from '../models/Payment';
import { env } from '../config/env';

// Phase 6.4 — Indian tax invoice for a completed, paid booking.
//
// Rates below are the commonly-cited GST rates for these two service
// categories under Indian tax law at the time this was written — Goods
// Transport Agency (road freight) at 5%, and labour/manpower-supply
// services at 18%. This is NOT certified tax advice (a disclaimer prints
// on every invoice below) — a real deployment should have these rates
// reviewed by an actual tax professional before relying on them for GST
// filing. What IS real and non-negotiable here: the invoice's own total
// always equals fareBreakdown.total exactly (what the customer actually
// paid, per the real Payment record) — this is a REVERSE calculation
// (taxable value = inclusive amount / (1+rate), tax = inclusive - taxable),
// never an amount added on top of what was charged. An invoice that showed
// a different total than what was actually collected would be worse than
// no invoice at all.
const GTA_RATE = 0.05; // vehicle/freight component
const LABOUR_RATE = 0.18; // hamali/labour component

// SIH26089 pan-India rewrite — the platform is no longer confined to one
// launch state (see seedFederations.ts's multi-state hierarchy), but this
// invoice still always splits CGST+SGST, never IGST. That's a real,
// acknowledged simplification, not a claim of correctness: this codebase
// has no reliable "customer's own registered state" vs "service region's
// state" comparison to determine when a booking is genuinely inter-state,
// and the invoice already carries its own "not a certified tax document,
// consult a qualified tax professional" disclaimer (below) precisely
// because of gaps like this one. A real deployment needs a buyer-state-vs-
// seller-state branch here before this can be trusted for actual GST
// filing on an inter-state booking.
function splitInclusive(inclusive: number, rate: number) {
  const taxable = inclusive / (1 + rate);
  const tax = inclusive - taxable;
  return { taxable: round2(taxable), tax: round2(tax) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface InvoiceLine {
  label: string;
  rate: number;
  taxable: number;
  tax: number;
  inclusive: number;
}

function buildLines(booking: IBooking): InvoiceLine[] {
  const { baseFare, distanceFare, hamaliFare, total } = booking.fareBreakdown;
  const preSurgeSubtotal = baseFare + distanceFare + hamaliFare;
  // fareBreakdown's components are documented pre-surge (fare.service.ts) —
  // scaled proportionally to their real post-surge (and therefore actually
  // charged) share, same pattern loadboard.controller.ts's acceptBid
  // already uses for the identical reason.
  const scale = preSurgeSubtotal > 0 ? total / preSurgeSubtotal : 1;
  const vehicleInclusive = round2((baseFare + distanceFare) * scale);
  const hamaliInclusive = round2(hamaliFare * scale);

  const lines: InvoiceLine[] = [];
  if (vehicleInclusive > 0) {
    const { taxable, tax } = splitInclusive(vehicleInclusive, GTA_RATE);
    lines.push({ label: 'Goods transportation service (GTA)', rate: GTA_RATE, taxable, tax, inclusive: vehicleInclusive });
  }
  if (hamaliInclusive > 0) {
    const { taxable, tax } = splitInclusive(hamaliInclusive, LABOUR_RATE);
    lines.push({ label: 'Loading/unloading labour service', rate: LABOUR_RATE, taxable, tax, inclusive: hamaliInclusive });
  }
  // Degenerate case (both components zero, e.g. a $0 test fixture) — one
  // line at 0% rather than an invoice with no line items at all.
  if (lines.length === 0) {
    lines.push({ label: 'Service charge', rate: 0, taxable: total, tax: 0, inclusive: total });
  }
  return lines;
}

export async function generateTaxInvoicePdf(
  booking: IBooking,
  customer: Pick<IUser, 'name' | 'businessProfile'>,
  payment: IPayment
): Promise<Buffer> {
  const lines = buildLines(booking);
  const totalTaxable = round2(lines.reduce((s, l) => s + l.taxable, 0));
  const totalTax = round2(lines.reduce((s, l) => s + l.tax, 0));
  const cgst = round2(totalTax / 2);
  const sgst = round2(totalTax - cgst);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const bookingRef = booking._id.toString().slice(-8).toUpperCase();
    // Deterministic from the payment record — the same booking always
    // yields the same invoice number if regenerated, no separate counter
    // to keep consistent.
    const invoiceNo = `FYRO-INV-${payment._id.toString().slice(-8).toUpperCase()}`;

    doc.fontSize(20).font('Helvetica-Bold').text(env.PLATFORM_LEGAL_NAME);
    doc.fontSize(12).font('Helvetica').text('Tax Invoice');
    doc.fontSize(9).fillColor('#666666');
    doc.text(`GSTIN: ${env.PLATFORM_GSTIN ?? 'Not yet registered'}`);
    doc.text(`Invoice No: ${invoiceNo}`);
    doc.text(`Invoice Date: ${new Date(payment.createdAt).toLocaleDateString('en-IN')}`);
    doc.text(`Booking Reference: ${bookingRef}`);
    doc.fillColor('#000000');
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.8);

    doc.fontSize(11).font('Helvetica-Bold').text('Billed To');
    doc.font('Helvetica').fontSize(10);
    doc.text(customer.businessProfile?.isBusiness && customer.businessProfile.companyName ? customer.businessProfile.companyName : customer.name);
    if (customer.businessProfile?.isBusiness) {
      doc.text(`GSTIN: ${customer.businessProfile.gstin ?? 'Not provided'}`);
    } else {
      doc.text('Individual / unregistered customer');
    }
    doc.moveDown(0.8);

    doc.fontSize(11).font('Helvetica-Bold').text('Service');
    doc.font('Helvetica').fontSize(10);
    doc.text(`Pickup: ${booking.pickupLocation.address}`);
    doc.text(`Drop: ${booking.dropLocation.address}`);
    if (booking.distanceKm) doc.text(`Distance: ${booking.distanceKm.toFixed(1)} km`);
    doc.moveDown(0.8);

    const colX = { desc: 50, rate: 300, taxable: 360, tax: 440, total: 500 };
    doc.fontSize(9).font('Helvetica-Bold');
    let y = doc.y;
    doc.text('Description', colX.desc, y, { width: 245 });
    doc.text('GST%', colX.rate, y, { width: 55 });
    doc.text('Taxable', colX.taxable, y, { width: 75 });
    doc.text('Tax', colX.tax, y, { width: 55 });
    doc.text('Total', colX.total, y, { width: 55 });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.3);

    doc.font('Helvetica').fontSize(9);
    for (const line of lines) {
      y = doc.y;
      doc.text(line.label, colX.desc, y, { width: 245 });
      doc.text(`${(line.rate * 100).toFixed(0)}%`, colX.rate, y, { width: 55 });
      doc.text(`Rs. ${line.taxable.toFixed(2)}`, colX.taxable, y, { width: 75 });
      doc.text(`Rs. ${line.tax.toFixed(2)}`, colX.tax, y, { width: 55 });
      doc.text(`Rs. ${line.inclusive.toFixed(2)}`, colX.total, y, { width: 55 });
      doc.moveDown(0.5);
    }
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.5);

    doc.font('Helvetica').fontSize(9);
    doc.text(`Taxable value: Rs. ${totalTaxable.toFixed(2)}`, { align: 'right' });
    doc.text(`CGST: Rs. ${cgst.toFixed(2)}`, { align: 'right' });
    doc.text(`SGST: Rs. ${sgst.toFixed(2)}`, { align: 'right' });
    doc.font('Helvetica-Bold').fontSize(11);
    doc.text(`Total (paid): Rs. ${payment.amount.toFixed(2)}`, { align: 'right' });
    doc.moveDown(1);

    doc.font('Helvetica').fontSize(8).fillColor('#888888');
    doc.text(
      'This is a system-generated reference invoice, not a certified tax document. GST rates shown are illustrative — please consult a qualified tax professional before using this for GST filing.',
      { align: 'left' }
    );

    doc.end();
  });
}
