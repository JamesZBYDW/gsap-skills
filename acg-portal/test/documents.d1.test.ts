import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { freshD1 } from './support/d1';
import { testPdf } from './support/pdf';
import { uploadDocument, downloadDocument } from '@/server/document-storage';
import { listDocuments } from '@/server/db/repo';
import type { D1Database } from '@/server/db/d1';
import type { SessionUser } from '@/lib/session';
import { signDocumentToken } from '@/lib/documents';
import { MAX_PDF_BYTES } from '@/lib/document-file';

let db: D1Database;
let dispose: () => Promise<void>;
const investor = 'pdf-owner';
const team = 'pdf-manager';
const owner: SessionUser = { id: 'owner', role: 'INVESTOR', email: 'owner@example.invalid', name: 'Owner',
  investorId: investor, mustChangePassword: false };
const pdf = testPdf();
let bucket: Awaited<ReturnType<typeof freshD1>>['bucket'];
const objectCount = async () => (await bucket.list()).objects.length;

beforeAll(async () => {
  ({ db, bucket, dispose } = await freshD1());
  await db.prepare("INSERT INTO investors (id, legal_name, type, email, state, created_at, updated_at) VALUES (?, 'Owner', 'INDIVIDUAL', 'owner@example.invalid', 'AWAITING', 1, 1)").bind(investor).run();
});
afterAll(async () => { await dispose?.(); });

function request(id: string, name = 'Signed – agreement.pdf', bytes: Buffer = pdf, extra: Record<string, string> = {}) {
  return new Request('http://localhost/upload', { method: 'POST', body: Uint8Array.from(bytes), headers: {
    'Content-Type': 'application/pdf', 'X-Upload-Id': id, 'X-Document-Name': encodeURIComponent(name),
    'X-Document-Kind': 'AGREEMENT', ...extra,
  } });
}

it('publishes and audits one private document across concurrent retries; returns the actual file only to authorized readers', async () => {
  const id = crypto.randomUUID();
  const before = await objectCount();
  await Promise.all([1, 2].map(() => uploadDocument(db, bucket, request(id), investor, team, null)));
  const list = await listDocuments(db, investor);
  expect(list.filter((doc) => doc.id === id)).toHaveLength(1);
  expect(await objectCount()).toBe(before + 1);
  expect(await db.prepare("SELECT count(*) AS n FROM audit_logs WHERE action = 'DOCUMENT_UPLOAD' AND target_id = ?")
    .bind(id).first()).toEqual({ n: 1 });
  await expect(uploadDocument(db, bucket, request(id, 'A different PDF.pdf'), investor, team, null)).rejects.toMatchObject({ status: 409 });
  await expect(downloadDocument(db, bucket, id, null, { ...owner, investorId: 'another' }, null)).rejects.toMatchObject({ status: 403 });
  await expect(downloadDocument(db, bucket, id, null, null, null)).rejects.toMatchObject({ status: 403 });
  await expect(downloadDocument(db, bucket, id, null, { ...owner, mustChangePassword: true }, null)).rejects.toMatchObject({ status: 403 });
  const response = await downloadDocument(db, bucket, id, null, owner, null);
  expect(response.headers.get('content-type')).toBe('application/pdf');
  expect(response.headers.get('content-disposition')).toContain('attachment; filename=');
  expect(response.headers.get('content-disposition')).toContain("filename*=UTF-8''Signed%20%E2%80%93%20agreement.pdf");
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(Buffer.from(await response.arrayBuffer())).toEqual(pdf);
  expect(await db.prepare("SELECT actor_user_id FROM audit_logs WHERE action = 'DOCUMENT_DOWNLOAD' AND target_id = ?")
    .bind(id).first()).toEqual({ actor_user_id: owner.id });
  vi.stubEnv('DOCUMENT_URL_SECRET', 'synthetic-document-secret-longer-than-32');
  try {
    const signed = await downloadDocument(db, bucket, id, signDocumentToken(id), null, null);
    expect(Buffer.from(await signed.arrayBuffer())).toEqual(pdf);
    await expect(downloadDocument(db, bucket, id, signDocumentToken('different'), null, null)).rejects.toMatchObject({ status: 403 });
  } finally { vi.unstubAllEnvs(); }
});

it('rejects invalid, truncated, oversized and misnamed uploads before publishing files', async () => {
  const id = crypto.randomUUID();
  const before = await objectCount();
  for (const [req, status] of [
    [request(id, 'statement.pdf', Buffer.from('not a PDF')), 415],
    [request(id, 'statement.pdf', pdf.subarray(0, 50)), 415],
    [request(id, '../vault.pdf'), 400],
    [request(id, 'notes.pdf', pdf, { 'Content-Length': String(MAX_PDF_BYTES + 1) }), 413],
    [request(id, 'notes.pdf', Buffer.alloc(MAX_PDF_BYTES + 1)), 413],
    [request(id, 'notes.pdf', pdf, { 'X-Document-Kind': 'OTHER' }), 400],
  ] as const) {
    await expect(uploadDocument(db, bucket, req, investor, team, null)).rejects.toMatchObject({ status });
  }
  expect(await objectCount()).toBe(before);
  expect(await db.prepare('SELECT id FROM documents WHERE id = ?').bind(id).first()).toBeNull();
});

it('cleans up stored bytes when the document/audit transaction rolls back', async () => {
  const id = crypto.randomUUID();
  const before = await objectCount();
  await db.prepare("CREATE TRIGGER fail_document_audit BEFORE INSERT ON audit_logs WHEN NEW.action = 'DOCUMENT_UPLOAD' BEGIN SELECT RAISE(ABORT, 'fixture failure'); END").run();
  try {
    await expect(uploadDocument(db, bucket, request(id), investor, team, null)).rejects.toThrow();
  } finally { await db.prepare('DROP TRIGGER fail_document_audit').run(); }
  expect(await objectCount()).toBe(before);
  expect(await db.prepare('SELECT id FROM documents WHERE id = ?').bind(id).first()).toBeNull();
});

it('recovers a committed upload when the D1 acknowledgement is lost', async () => {
  const id = crypto.randomUUID();
  const ambiguous: D1Database = {
    prepare: (sql) => db.prepare(sql),
    async batch(statements) {
      await db.batch(statements);
      throw new Error('Synthetic lost acknowledgement');
    },
  };
  const published = await uploadDocument(ambiguous, bucket, request(id), investor, team, null);
  expect(published.id).toBe(id);
  const response = await downloadDocument(db, bucket, id, null, owner, null);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(pdf);
});
