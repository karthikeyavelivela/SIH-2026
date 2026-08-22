import PDFDocument from 'pdfkit';

// Phase 6.6 — real PDF export for admin custom reports. Before this,
// admin/reports/page.tsx's format picker showed "PDF (deferred — no PDF
// library in the project yet)" as an honest placeholder; pdfkit was
// already a dependency (used for the Bill of Lading, see bolPdf.service.ts)
// so this was a real, closeable gap rather than a genuine missing-library
// blocker. Capped at 500 rows — a printable report, not a data dump (the
// CSV export stays the tool for bulk data, same distinction most BI tools
// draw between "export" and "print report").
const MAX_PDF_ROWS = 500;

export function generateReportPdf(title: string, header: string[], rows: (string | number)[][]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).font('Helvetica-Bold').text('FYRO', { continued: true });
    doc.fontSize(12).font('Helvetica').text(`  ${title}`);
    doc.fontSize(9).fillColor('#666666').text(`Generated: ${new Date().toLocaleString('en-IN')}`);
    doc.fillColor('#000000');
    doc.moveDown(0.8);

    const truncated = rows.length > MAX_PDF_ROWS;
    const visibleRows = rows.slice(0, MAX_PDF_ROWS);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = pageWidth / header.length;
    const rowHeight = 20;
    let y = doc.y;

    function drawHeaderRow() {
      doc.font('Helvetica-Bold').fontSize(9);
      header.forEach((h, i) => {
        doc.text(h, doc.page.margins.left + i * colWidth, y, { width: colWidth - 4, ellipsis: true });
      });
      y += rowHeight;
      doc.moveTo(doc.page.margins.left, y - 4).lineTo(doc.page.width - doc.page.margins.right, y - 4).strokeColor('#cccccc').stroke();
    }

    drawHeaderRow();
    doc.font('Helvetica').fontSize(8);

    for (const row of visibleRows) {
      if (y > doc.page.height - doc.page.margins.bottom - rowHeight) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHeaderRow();
        doc.font('Helvetica').fontSize(8);
      }
      row.forEach((cell, i) => {
        doc.text(String(cell), doc.page.margins.left + i * colWidth, y, { width: colWidth - 4, ellipsis: true });
      });
      y += rowHeight;
    }

    if (truncated) {
      doc.moveDown(1);
      doc.fontSize(8).fillColor('#888888').text(
        `Showing the first ${MAX_PDF_ROWS} of ${rows.length} rows — use the CSV export for the full data set.`,
        { align: 'left' }
      );
    }

    doc.end();
  });
}
