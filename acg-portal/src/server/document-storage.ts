import 'server-only';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { auditStmt } from '@/lib/audit';
import { MAX_PDF_BYTES } from '@/lib/document-file';
import type { Document, DocumentKind } from '@/lib/domain';
import { verifyDocumentToken } from '@/lib/documents';
import { HttpError } from '@/lib/http';
import { documentKindLabel } from '@/lib/labels';
import type { SessionUser } from '@/lib/session';
import { newId, safeErrorSummary, type D1Database } from '@/server/db/d1';
import { getDocumentForDownload, investorExists } from '@/server/db/repo';

export interface DocumentBucket {
  put(key: string, bytes: ArrayBuffer, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream<Uint8Array>; size: number } | null>;
  delete(key: string): Promise<void>;
}

export function documentBucket(): DocumentBucket {
  const env = getCloudflareContext().env as unknown as { DOCUMENTS?: DocumentBucket };
  if (!env.DOCUMENTS) throw new HttpError(503, 'Document storage is unavailable.');
  return env.DOCUMENTS;
}

function uploadName(encoded: string | null): string {
  let name: string;
  try {
    name = decodeURIComponent(encoded ?? '').trim().normalize('NFC');
  } catch {
    throw new HttpError(400, 'Invalid document filename.');
  }
  if (name.length > 180 || !/\.pdf$/i.test(name) || !name.slice(0, -4).trim() ||
      /[/\\\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(name)) {
    throw new HttpError(400, 'Choose a PDF with a valid filename (up to 180 characters).');
  }
  return name;
}

/** Check the declared length early and enforce the limit even on chunked requests. */
async function readPdf(req: Request): Promise<ArrayBuffer> {
  if (req.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/pdf') {
    throw new HttpError(415, 'Choose a PDF file.');
  }
  if (Number(req.headers.get('content-length')) > MAX_PDF_BYTES) throw new HttpError(413, 'PDFs must be 10 MB or smaller.');
  if (!req.body) throw new HttpError(400, 'Choose a PDF file.');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PDF_BYTES) {
        await reader.cancel();
        throw new HttpError(413, 'PDFs must be 10 MB or smaller.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const decoder = new TextDecoder();
  if (!/^%PDF-(1\.[0-7]|2\.0)[\r\n]/.test(decoder.decode(bytes.subarray(0, 10))) ||
      !/%%EOF\s*$/.test(decoder.decode(bytes.subarray(Math.max(0, size - 1024))))) {
    throw new HttpError(415, 'The selected file is not a complete PDF.');
  }
  return bytes.buffer;
}

/** An upload owns its own R2 object until a matching D1 row publishes it. */
export async function uploadDocument(database: D1Database, bucket: DocumentBucket, req: Request, investorId: string,
  actorUserId: string, ip: string | null): Promise<Document> {
  if (!(await investorExists(database, investorId))) throw new HttpError(404, 'Investor not found.');
  const kind = req.headers.get('x-document-kind') as DocumentKind;
  if (!Object.hasOwn(documentKindLabel, kind)) throw new HttpError(400, 'Choose a document type.');
  const name = uploadName(req.headers.get('x-document-name'));
  // The browser keeps this ID across retries until a different file/type is selected.
  const id = req.headers.get('x-upload-id') ?? newId();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new HttpError(400, 'Invalid upload ID.');
  }
  const bytes = await readPdf(req);
  const digest = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
  const suffix = '-' + digest + '.pdf';
  const existing = await getDocumentForDownload(database, id);
  const acceptRetry = (doc: Document) => {
    if (doc.investorId !== investorId || doc.name !== name || doc.kind !== kind || !doc.storageKey.endsWith(suffix)) {
      throw new HttpError(409, 'That upload ID belongs to a different document.');
    }
    return doc;
  };
  if (existing) return acceptRetry(existing);

  const key = 'documents/' + investorId + '/' + newId() + suffix;
  const at = new Date();
  const document = { id, investorId, name, kind, storageKey: key, issuedDate: at };
  const discard = async () => {
    try { await bucket.delete(key); }
    catch (err) { console.error('[documents] private object cleanup failed', safeErrorSummary(err)); }
  };
  try {
    const stored = await bucket.put(key, bytes, { httpMetadata: { contentType: 'application/pdf' } });
    if (!stored) throw new HttpError(503, 'The PDF could not be stored. Please retry.');
  } catch (err) {
    await discard();
    throw err;
  }
  try {
    await database.batch([
      database.prepare('INSERT INTO documents (id, investor_id, name, kind, issued_date, storage_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(id, investorId, name, kind, at.getTime(), key, at.getTime()),
      auditStmt(database, { action: 'DOCUMENT_UPLOAD', actorUserId, targetType: 'Document', targetId: id,
        metadata: { investorId, kind, bytes: bytes.byteLength }, ip }, at.getTime()),
    ]);
  } catch (err) {
    // A timeout may arrive after D1 committed. Preserve a referenced object.
    // Each attempt has a distinct key, so cleanup cannot race a parallel upload.
    const recorded = await getDocumentForDownload(database, id);
    if (recorded?.storageKey === key) return recorded;
    // A transport timeout can precede the commit. If it is still unconfirmed,
    // retain private bytes so a delayed commit can never point at a deleted PDF.
    if (!recorded && !(err instanceof Error && /SQLITE_|constraint failed/i.test(err.message))) {
      console.error('[documents] metadata write outcome unknown', safeErrorSummary(err));
      throw err;
    }
    await discard();
    if (recorded) return acceptRetry(recorded);
    throw err;
  }
  return document;
}

function attachmentName(name: string): string {
  const basename = name.replace(/\.pdf$/i, '').replace(/[/\\\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, '_');
  const stem = basename.replace(/[^a-zA-Z0-9 _.-]/g, '_').replace(/^[ .]+/g, '').slice(0, 170);
  const ascii = (stem || 'Document') + '.pdf';
  const utf8 = encodeURIComponent(basename + '.pdf').replace(/['()*]/g, (c) =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return 'attachment; filename="' + ascii + '"; filename*=UTF-8\'\'' + utf8;
}

export async function downloadDocument(database: D1Database, bucket: DocumentBucket, id: string, token: string | null,
  user: SessionUser | null, ip: string | null): Promise<Response> {
  const signed = verifyDocumentToken(id, token);
  if (!signed && (!user || user.mustChangePassword)) throw new HttpError(403, 'Document access denied.');
  const doc = await getDocumentForDownload(database, id);
  if (!doc) throw new HttpError(404, 'Document not found.');
  if (!signed && user?.role !== 'TEAM' && user?.investorId !== doc.investorId) throw new HttpError(403, 'Document access denied.');
  const object = await bucket.get(doc.storageKey);
  if (!object) throw new HttpError(404, 'Document file not found.');
  try {
    await auditStmt(database, { action: 'DOCUMENT_DOWNLOAD', actorUserId: user?.id ?? null, targetType: 'Document', targetId: id, ip }).run();
  } catch (err) {
    await object.body.cancel().catch(() => {});
    throw err;
  }
  return new Response(object.body, { headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': attachmentName(doc.name),
    'Content-Length': String(object.size),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}
