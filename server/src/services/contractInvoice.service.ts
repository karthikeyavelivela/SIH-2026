import PDFDocument from 'pdfkit';
import { env } from '../config/env';
import { Booking } from '../models/Booking';
import type { IContract } from '../models/Contract';
import type { IUser } from '../models/User';
import { buildLines } from './taxInvoice.service';
import { monthlyStatement } from './contract.service';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * P1.6 — one consolidated GST invoice for a contract's month: every
 * completed visit on its own row with the service fee split shown (society /
 * welfare pool / guarantee reserve / platform), and the GST lines summed
 * across the month from the same per-visit lines a single booking's invoice
 * uses — so a month's invoice is exactly the sum of its visits.
 */
export async function generateContractInvoicePdf(
  contract: IContract,
  institution: Pick<IUser, 'name' | 'institutionProfile'>,
  societyName: string,
  month: string
): Promise<Buffer> {
  const statement = await monthlyStatement(contract, month);
  const visits = await Booking.find({ _id: { $in: statement.lines.map((l) => l.bookingId) } });

  // GST lines aggregated by description and rate across the month.
  const gst = new Map<string, { label: string; rate: number; taxable: number; tax: number; inclusive: number }>();
  for (const v of visits) {
    for (const line of buildLines(v)) {
      const k = `${line.label}|${line.rate}`;
      const cur = gst.get(k) ?? { label: line.label, rate: line.rate, taxable: 0, tax: 0, inclusive: 0 };
      cur.taxable += line.taxable;
      cur.tax += line.tax;
      cur.inclusive += line.inclusive;
      gst.set(k, cur);
    }
  }
  const gstLines = [...gst.values()].map((l) => ({ ...l, taxable: round2(l.taxable), tax: round2(l.tax), inclusive: round2(l.inclusive) }));
  const totalTax = round2(gstLines.reduce((s, l) => s + l.tax, 0));
  const cgst = round2(totalTax / 2);
  const sgst = round2(totalTax - cgst);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const invoiceNo = `FYRO-CON-${contract._id.toString().slice(-6).toUpperCase()}-${month.replace('-', '')}`;
    doc.fontSize(20).font('Helvetica-Bold').text(env.PLATFORM_LEGAL_NAME);
    doc.fontSize(12).font('Helvetica').text('Tax Invoice — monthly contract statement');
    doc.fontSize(9).fillColor('#666666');
    doc.text(`GSTIN: ${env.PLATFORM_GSTIN ?? 'Not yet registered'}`);
    doc.text(`Invoice No: ${invoiceNo}`);
    doc.text(`Period: ${month}`);
    doc.text(`Contract: ${contract._id.toString().slice(-6).toUpperCase()} · ${contract.categorySlug} · ${societyName}`);
    doc.fillColor('#000000');
    doc.moveDown(0.8);

    doc.fontSize(11).font('Helvetica-Bold').text('Billed To');
    doc.font('Helvetica').fontSize(10);
    doc.text(institution.institutionProfile?.orgName ?? institution.name);
    doc.text(`GSTIN: ${institution.institutionProfile?.gstin ?? 'Not provided'}`);
    doc.text(`Site: ${contract.location.address}`, { width: 495 });
    doc.moveDown(0.8);

    // Visit rows with the fee split.
    doc.fontSize(9).font('Helvetica-Bold');
    const c = { date: 50, workers: 120, rate: 170, fee: 240, split: 300, total: 490 };
    let y = doc.y;
    doc.text('Visit', c.date, y);
    doc.text('Crew', c.workers, y);
    doc.text('Workers', c.rate, y);
    doc.text('Fee', c.fee, y);
    doc.text('Fee split (society / welfare / reserve / platform)', c.split, y, { width: 185 });
    doc.text('Total', c.total, y);
    doc.moveDown(0.6);
    doc.font('Helvetica');
    for (const l of statement.lines) {
      y = doc.y;
      doc.text(l.date, c.date, y);
      doc.text(String(l.workers), c.workers, y);
      doc.text(`Rs. ${l.workerRate.toFixed(2)}`, c.rate, y);
      doc.text(`Rs. ${l.serviceFee.toFixed(2)}`, c.fee, y);
      doc.text(
        `${l.feeParts.society.toFixed(2)} / ${l.feeParts.welfarePool.toFixed(2)} / ${l.feeParts.guaranteeReserve.toFixed(2)} / ${l.feeParts.platform.toFixed(2)}`,
        c.split,
        y,
        { width: 185 }
      );
      doc.text(`Rs. ${l.total.toFixed(2)}`, c.total, y);
      doc.moveDown(0.4);
    }
    if (statement.lines.length === 0) doc.text('No completed visits in this period.');
    doc.moveDown(0.6);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').text('GST');
    doc.font('Helvetica');
    for (const l of gstLines) {
      doc.text(`${l.label} @ ${(l.rate * 100).toFixed(0)}% — taxable Rs. ${l.taxable.toFixed(2)}, tax Rs. ${l.tax.toFixed(2)}, total Rs. ${l.inclusive.toFixed(2)}`, { width: 495 });
    }
    doc.moveDown(0.5);
    doc.text(`CGST: Rs. ${cgst.toFixed(2)}`, { align: 'right' });
    doc.text(`SGST: Rs. ${sgst.toFixed(2)}`, { align: 'right' });
    doc.text(`Workers' pay (all of it to the workers): Rs. ${statement.totals.workerRate.toFixed(2)}`, { align: 'right' });
    doc.text(`Service fee: Rs. ${statement.totals.serviceFee.toFixed(2)}`, { align: 'right' });
    doc.font('Helvetica-Bold').fontSize(11);
    doc.text(`Total for ${month}: Rs. ${statement.totals.total.toFixed(2)}`, { align: 'right' });
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(8).fillColor('#888888');
    doc.text(
      'This is a system-generated reference invoice, not a certified tax document. GST rates shown are illustrative — please consult a qualified tax professional before using this for GST filing.'
    );
    doc.end();
  });
}
