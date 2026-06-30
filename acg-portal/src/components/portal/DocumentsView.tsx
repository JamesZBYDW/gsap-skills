import type { DocumentVM } from '@/server/portal';
import { Icon } from '@/components/Icon';

const COLS = '1.8fr 1fr 1fr 90px';

export function DocumentsView({ documents }: { documents: DocumentVM[] }) {
  return (
    <div className="content">
      <div className="card" style={{ padding: '8px 24px 14px' }}>
        <div
          className="tableHead"
          style={{ display: 'grid', gridTemplateColumns: COLS, padding: '16px 0 12px' }}
        >
          <div>Document</div>
          <div>Type</div>
          <div>Date</div>
          <div style={{ textAlign: 'right' }}>Download</div>
        </div>
        {documents.map((d) => (
          <div
            key={d.id}
            className="tableRow"
            style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', padding: '14px 0' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 9,
                  flex: 'none',
                  background: '#f4f1ea',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#a87e45',
                }}
              >
                <Icon name="file" size={17} />
              </span>
              <span style={{ fontSize: '.88rem', fontWeight: 600 }}>{d.name}</span>
            </div>
            <div>
              <span className="kindPill">{d.kindLabel}</span>
            </div>
            <div style={{ fontSize: '.84rem', color: '#5b6473' }}>{d.date}</div>
            <div style={{ textAlign: 'right' }}>
              <a className="iconBtn" href={`/api/documents/${d.id}/download`} download>
                <Icon name="download" size={17} />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
