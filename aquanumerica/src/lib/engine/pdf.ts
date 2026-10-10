/**
 * Minimal single-page PDF writer.
 *
 * Embeds a JPEG directly (DCTDecode – no re-encoding) centred on an A4 page
 * with a title and caption in the standard Times font, so no font embedding or
 * third-party library is needed.
 */

export interface PdfOptions {
  title: string;
  caption: string;
  /** Page size in points; defaults to A4 oriented to match the image. */
  page?: [number, number];
}

const enc = new TextEncoder();

const ASCII_FALLBACK: Record<string, string> = {
  "·": "-", "—": "-", "–": "-", "’": "'", "‘": "'",
  "“": '"', "”": '"', "…": "...", "×": "x",
};

/** PDF string literal with escaping. Content streams are written as ASCII. */
function pdfString(s: string): string {
  const ascii = Array.from(s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
    .map((ch) => (ch.charCodeAt(0) < 128 ? ch : ASCII_FALLBACK[ch] ?? "?"))
    .join("");
  return `(${ascii.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;
}

/** Greedy word wrap to a maximum character count per line. */
function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && (line + " " + word).length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/** Approximate Times-Roman advance width (per 1pt font size) for centring. */
function textWidth(s: string, size: number) {
  return s.length * size * 0.46;
}

export function buildPdf(jpeg: Uint8Array, imgW: number, imgH: number, opts: PdfOptions): Blob {
  const landscape = imgW > imgH * 1.05;
  const [pw, ph] = opts.page ?? (landscape ? [841.89, 595.28] : [595.28, 841.89]);
  const margin = 54;
  const capSize = 9.5;
  const capLines = wrap(opts.caption, Math.floor((pw - margin * 2) / (capSize * 0.5))).slice(0, 4);
  const textBlock = 58 + capLines.length * 13;
  const maxW = pw - margin * 2;
  const maxH = ph - margin * 2 - textBlock;
  const k = Math.min(maxW / imgW, maxH / imgH);
  const dw = imgW * k, dh = imgH * k;
  const dx = (pw - dw) / 2;
  const dy = margin + textBlock + (maxH - dh) / 2;

  const titleSize = 20;
  const titleY = dy - 34, capY = dy - 52;
  const content = [
    "q",
    // Soft frame line
    "0.82 0.80 0.76 RG 0.5 w",
    `${(dx - 8).toFixed(2)} ${(dy - 8).toFixed(2)} ${(dw + 16).toFixed(2)} ${(dh + 16).toFixed(2)} re S`,
    `${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${dx.toFixed(2)} ${dy.toFixed(2)} cm`,
    "/Im0 Do",
    "Q",
    "BT",
    "0.18 0.20 0.26 rg",
    `/F1 ${titleSize} Tf`,
    `${((pw - textWidth(opts.title, titleSize)) / 2).toFixed(2)} ${titleY.toFixed(2)} Td`,
    `${pdfString(opts.title)} Tj`,
    "ET",
    ...capLines.flatMap((line, i) => [
      "BT",
      "0.45 0.47 0.52 rg",
      `/F2 ${capSize} Tf`,
      `${((pw - textWidth(line, capSize) * 1.05) / 2).toFixed(2)} ${(capY - i * 13).toFixed(2)} Td`,
      `${pdfString(line)} Tj`,
      "ET",
    ]),
  ].join("\n");

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === "string" ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const obj = (n: number, body: string) => {
    offsets[n] = length;
    push(`${n} 0 obj\n${body}\nendobj\n`);
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] ` +
      "/Resources << /XObject << /Im0 4 0 R >> /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 7 0 R >>",
  );
  offsets[4] = length;
  push(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  push(jpeg);
  push("\nendstream\nendobj\n");
  obj(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic /Encoding /WinAnsiEncoding >>");
  obj(6, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const contentBytes = enc.encode(content);
  obj(7, `<< /Length ${contentBytes.length} >>\nstream\n${content}\nendstream`);

  const xrefStart = length;
  let xref = "xref\n0 8\n0000000000 65535 f \n";
  for (let n = 1; n <= 7; n++) xref += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}
