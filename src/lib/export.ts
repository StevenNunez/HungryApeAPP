/**
 * Excel / PDF report exports. Both run 100% in the browser (no server, no per-use cost)
 * and the heavy libraries are loaded on demand, only when the owner clicks "Descargar".
 */

export type Cell = string | number | null;

export interface ReportTable {
  title: string;
  headers: string[];
  rows: Cell[][];
  /** Optional line printed under the table (e.g. a total or a note). */
  note?: string;
}

const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

// ─── Excel ───────────────────────────────────────────────────────────────────

export async function exportExcel(fileBase: string, tables: ReportTable[]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');

  const sheets = tables.map(t => {
    const widths = t.headers.map((h, i) => {
      const longest = Math.max(h.length, ...t.rows.map(r => String(r[i] ?? '').length));
      return { width: Math.min(40, Math.max(12, longest + 2)) };
    });
    const data = [
      t.headers.map(h => ({ value: h, fontWeight: 'bold' as const })),
      ...t.rows.map(r =>
        r.map(v =>
          typeof v === 'number' ? { value: v, type: Number } : { value: v === null ? '' : String(v) },
        ),
      ),
    ];
    return {
      // Excel sheet names: max 31 chars, no : \ / ? * [ ]
      sheet: t.title.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31),
      data,
      columns: widths,
      stickyRowsCount: 1,
    };
  });

  await (writeXlsxFile as any)(sheets).toFile(`${slug(fileBase)}.xlsx`);
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

export interface PdfReport {
  tenantName: string;
  title: string;
  subtitle?: string;
  tables: ReportTable[];
}

// "Teo Labs" gradient stops: blue → purple → green (same as the shared InteractiveLogo)
const GRADIENT: [number, number, number][] = [[37, 99, 235], [168, 85, 247], [34, 197, 94]];

function gradientAt(t: number): [number, number, number] {
  const seg = t <= 0.5 ? 0 : 1;
  const local = t <= 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const [a, b] = [GRADIENT[seg], GRADIENT[seg + 1]];
  return [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * local)) as [number, number, number];
}

export async function exportPdf(fileBase: string, report: PdfReport) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(20, 20, 20);
  doc.text(report.title, margin, 56);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(90, 90, 90);
  doc.text(report.tenantName, margin, 74);
  if (report.subtitle) doc.text(report.subtitle, margin, 90);
  doc.setDrawColor(239, 68, 68);
  doc.setLineWidth(2);
  doc.line(margin, 100, pageW - margin, 100);

  let y = 124;
  for (const t of report.tables) {
    if (y > pageH - 140) { doc.addPage(); y = 56; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 20);
    doc.text(t.title, margin, y);

    if (t.rows.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 120);
      doc.text('Sin datos en este período.', margin, y + 18);
      y += 44;
      continue;
    }

    autoTable(doc, {
      startY: y + 8,
      head: [t.headers],
      body: t.rows.map(r => r.map(c => (c === null ? '' : String(c)))),
      margin: { left: margin, right: margin, bottom: 60 },
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [239, 68, 68], textColor: 255 },
      alternateRowStyles: { fillColor: [247, 247, 247] },
      // Right-align columns that hold numbers
      didParseCell: (data: any) => {
        const raw = t.rows[data.row.index]?.[data.column.index];
        if (data.section === 'body' && typeof raw === 'number') data.cell.styles.halign = 'right';
      },
    });
    y = (doc as any).lastAutoTable.finalY + 14;

    if (t.note) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(110, 110, 110);
      const lines = doc.splitTextToSize(t.note, pageW - margin * 2) as string[];
      doc.text(lines, margin, y);
      y += lines.length * 11 + 10;
    } else {
      y += 6;
    }
  }

  // Footer on every page: "Desarrollado por Teo Labs ®" with the per-letter gradient + link
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const fy = pageH - 28;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(130, 130, 130);

    const markSize = 11;
    const lead = 'Desarrollado por ';
    const brand = 'Teo Labs';
    const tail = ' ®';
    doc.setFont('helvetica', 'bold');
    const brandW = doc.getTextWidth(brand);
    doc.setFont('helvetica', 'normal');
    const leadW = doc.getTextWidth(lead);
    const tailW = doc.getTextWidth(tail);
    const markGap = 4;
    let x = (pageW - (markSize + markGap + leadW + brandW + tailW)) / 2;

    // Isotipo oficial (la Θ) dibujado en vectores, no como imagen
    const k = markSize / 93.13;
    const mx = (vx: number) => x + (vx - 2.16) * k;
    const my = (vy: number) => fy - markSize + 2 + (vy - 4.71) * k;
    doc.setLineCap('butt');
    doc.setLineWidth(6.5 * k);
    doc.setDrawColor(88, 82, 255);
    doc.circle(mx(46), my(54), 35 * k, 'S');
    doc.line(mx(12.46), my(44), mx(79.54), my(44));
    doc.line(mx(46), my(44), mx(46), my(89));
    doc.setLineWidth(3 * k);
    doc.setDrawColor(34, 197, 94);
    doc.circle(mx(81), my(19), 7.2 * k, 'S');
    doc.line(mx(73.8), my(19), mx(88.2), my(19));
    x += markSize + markGap;

    doc.text(lead, x, fy);
    x += leadW;
    const brandX = x;
    doc.setFont('helvetica', 'bold');
    [...brand].forEach((ch, i) => {
      const [r, g, b] = gradientAt(i / (brand.length - 1));
      doc.setTextColor(r, g, b);
      doc.text(ch, x, fy);
      x += doc.getTextWidth(ch);
    });
    doc.link(brandX, fy - 9, brandW, 12, { url: 'https://www.teolabs.app' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(130, 130, 130);
    doc.text(tail, x, fy);

    doc.setFontSize(8);
    doc.text(`${p} / ${pages}`, pageW - margin, fy, { align: 'right' });
  }

  doc.save(`${slug(fileBase)}.pdf`);
}
