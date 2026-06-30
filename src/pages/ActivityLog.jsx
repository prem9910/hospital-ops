import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { fDateTime, exportToExcel } from '../utils';
import { EmptyState } from '../components/common/Alert';
import { Pagination, paginate } from '../components/common/Pagination';
import { deleteAllFromTable } from '../services/db';

const IS = { padding: '8px 12px', borderRadius: 7, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 12.5, color: '#1a2535', outline: 'none', background: 'white', fontWeight: 600 };

function ConfirmModal({ open, onConfirm, onCancel, count }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', borderRadius: 14, padding: 28, maxWidth: 380, width: '90%', boxShadow: '0 8px 40px rgba(0,0,0,0.2)', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>🗑️</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, color: '#0b1e3d', marginBottom: 8 }}>Clear Activity Log?</div>
        <div style={{ fontSize: 13, color: '#6b7a90', marginBottom: 20 }}>
          All <strong style={{ color: '#c0392b' }}>{count} entries</strong> will be permanently deleted.<br />This action cannot be undone.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onConfirm} style={{ padding: '9px 24px', borderRadius: 8, background: '#c0392b', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
            Yes, Clear All
          </button>
          <button onClick={onCancel} style={{ padding: '9px 24px', borderRadius: 8, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ActivityLog() {
  const { actLog, save, logAct } = useApp();
  const [search, setSearch] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [page, setPage] = useState(1);
  const [clearing, setClearing] = useState(false);

  const filtered = [...actLog].filter((l) => {
    if (!search) return true;
    const q = search.toUpperCase();
    return (l.action || '').toUpperCase().includes(q) || (l.details || '').toUpperCase().includes(q) || (l.by || '').toUpperCase().includes(q);
  }).sort((a, b) => new Date(b.at) - new Date(a.at));
  const paged = paginate(filtered, page, 30);

  async function handleClear() {
    if (clearing) return;
    setClearing(true);
    try {
      await deleteAllFromTable('workdesk-actlog');
      await save('workdesk-actlog', []);
    } finally {
      setClearing(false);
      setShowConfirm(false);
    }
  }

  return (
    <div>
      <ConfirmModal open={showConfirm} onConfirm={handleClear} onCancel={() => setShowConfirm(false)} count={actLog.length} />

      <div className="page-header">
        <h2 className="page-header-title" style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>Activity Log 📜</h2>
        <div className="page-header-actions" style={{ alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#6b7a90', fontWeight: 600 }}>{filtered.length} entries</span>
          <button onClick={() => exportToExcel(filtered.map(l => ({ By: l.by, Role: l.role, Action: l.action, Details: l.details, Time: l.atStr })), 'activity-log')} style={{ padding: '7px 14px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>⬇ Export</button>
          <button onClick={() => window.print()} style={{ padding: '7px 14px', borderRadius: 8, background: '#334155', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>🖨 Print</button>
          {actLog.length > 0 && (
            <button
              onClick={() => setShowConfirm(true)}
              className="activity-log-clear-btn"
              style={{ padding: '7px 15px', borderRadius: 8, background: '#fde8e8', color: '#c0392b', border: '1px solid #f5b7b1', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}
            >
              🗑️ Clear All
            </button>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 SEARCH..." style={{ ...IS, width: '100%' }} />
      </div>

      <div className="activity-log-wrap" style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Date/Time', 'By', 'Action', 'Details'].map((h) => <th key={h} style={{ background: '#f3f7fc', padding: '9px 14px', textAlign: 'left', fontSize: 10.5, fontWeight: 800, color: '#6b7a90', letterSpacing: 0.8, textTransform: 'uppercase', borderBottom: '1px solid #d8e2ef' }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {paged.items.length ? paged.items.map((l, i) => (
              <tr key={i} onMouseEnter={(e) => e.currentTarget.style.background = '#f8fbff'} onMouseLeave={(e) => e.currentTarget.style.background = 'white'}>
                <td style={{ padding: '10px 14px', fontSize: 11, color: '#6b7a90', whiteSpace: 'nowrap' }}>{fDateTime(l.at)}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700 }}>{l.by || '—'}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ background: '#e8f4fd', color: '#0d7377', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>{l.action}</span>
                </td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: '#1a2535' }}>{l.details || '—'}</td>
              </tr>
            )) : <tr><td colSpan={4}><EmptyState icon="📜" message="NO ACTIVITY FOUND" /></td></tr>}
          </tbody>
        </table>
        <div style={{ borderTop: '1px solid #d8e2ef', padding: '0 8px' }}>
          <Pagination {...paged} onPage={(p) => setPage(p)} />
        </div>
      </div>
    </div>
  );
}
