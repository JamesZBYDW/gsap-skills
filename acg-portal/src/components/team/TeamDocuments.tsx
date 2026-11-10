'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { MAX_PDF_BYTES } from '@/lib/document-file';
import type { DocumentKind } from '@/lib/domain';
import { documentKindLabel } from '@/lib/labels';
import type { DocumentVM } from '@/server/portal';

export function TeamDocuments({ investorId }: { investorId: string }) {
  const endpoint = '/api/team/investors/' + encodeURIComponent(investorId) + '/documents';
  const [documents, setDocuments] = useState<DocumentVM[] | null>(null);
  const [revision, setRevision] = useState(0);
  const [listError, setListError] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<DocumentKind>('STATEMENT');
  const [uploadId, setUploadId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setListError(false);
    void (async () => {
      try {
        const response = await fetch(endpoint, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error();
        const data: { documents: DocumentVM[] } = await response.json();
        if (!controller.signal.aborted) setDocuments(data.documents);
      } catch {
        if (!controller.signal.aborted) setListError(true);
      }
    })();
    return () => controller.abort();
  }, [endpoint, revision]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    if (file.size > MAX_PDF_BYTES) { setMessage('PDFs must be 10 MB or smaller.'); return; }
    const form = event.currentTarget;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf', 'X-Document-Name': encodeURIComponent(file.name),
          'X-Document-Kind': kind, 'X-Upload-Id': uploadId,
        },
        body: file,
      });
      const data = await response.json().catch(() => null) as { document?: DocumentVM; error?: string } | null;
      if (!response.ok || !data?.document) throw new Error(data?.error ?? 'Upload failed. Please try again.');
      const uploaded = data.document;
      setDocuments((items) => [uploaded, ...(items ?? []).filter((item) => item.id !== uploaded.id)]);
      setFile(null);
      setKind('STATEMENT');
      form.reset();
      setMessage('PDF uploaded.');
      if (listError) setRevision((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ padding: '18px 20px' }} aria-label="Investor documents">
      <div className="tileEyebrow">DOCUMENTS</div>
      {listError ? (
        <p role="alert">Could not load documents. <button type="button" className="chip" onClick={() => setRevision((n) => n + 1)}>Retry</button></p>
      ) : documents === null ? <p role="status">Loading documents…</p> : documents.length === 0 ? (
        <p style={{ fontSize: '.85rem' }}>No documents yet.</p>
      ) : (
        <ul style={{ padding: 0, listStyle: 'none' }}>
          {documents.map((d) => (
            <li key={d.id} className="tableRow" style={{ padding: '8px 0' }}>
              <a style={{ overflowWrap: 'anywhere' }} href={'/api/documents/' + encodeURIComponent(d.id) + '/download'} download>{d.name}</a>
              <div style={{ fontSize: '.78rem', color: '#5b6473' }}>{d.kindLabel} · {d.date}</div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={upload} style={{ display: 'grid', gap: 12 }}>
        <label><span className="fieldLabelGold">DOCUMENT TYPE</span>
          <select className="fieldLight" data-testid="document-kind" disabled={busy} value={kind} onChange={(e) => {
            setKind(e.target.value as DocumentKind);
            setUploadId(crypto.randomUUID());
          }}>
            {Object.entries(documentKindLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label><span className="fieldLabelGold">PDF FILE (UP TO 10 MB)</span>
          <input type="file" className="fieldLight" data-testid="document-file" accept=".pdf,application/pdf" required disabled={busy}
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setUploadId(crypto.randomUUID()); setMessage(''); }} />
        </label>
        <button type="submit" className="btnNeutral" data-testid="document-upload" disabled={busy || !file || (documents === null && !listError)}>
          {busy ? 'Uploading…' : 'Upload PDF'}
        </button>
        {message && <div role="status">{message}</div>}
      </form>
    </section>
  );
}
