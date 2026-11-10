/** A one-page PDF with a complete cross-reference table for upload/download tests. */
export function testPdf(): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += (index + 1) + ' 0 obj\n' + body + '\nendobj\n';
  });
  const startXref = Buffer.byteLength(pdf);
  pdf += 'xref\n0 4\n0000000000 65535 f \n';
  for (const offset of offsets) pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
  return Buffer.from(pdf + 'trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n' + startXref + '\n%%EOF\n');
}
