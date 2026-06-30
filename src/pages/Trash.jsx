import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { fDate } from '../utils';
import { EmptyState, Alert } from '../components/common/Alert';
import { Pagination, paginate } from '../components/common/Pagination';
import { deleteAllFromTable } from '../services/db';

const IS = { padding: '8px 12px', borderRadius: 7, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 12.5, color: '#1a2535', outline: 'none', background: 'white', fontWeight: 600 };

function ConfirmModal({ open, onConfirm, onCancel, count }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', borderRadius: 14, padding: 28, maxWidth: 380, width: '90%', boxShadow: '0 8px 40px rgba(0,0,0,0.2)', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>⚠️</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, color: '#0b1e3d', marginBottom: 8 }}>Permanently Clear Trash?</div>
        <div style={{ fontSize: 13, color: '#6b7a90', marginBottom: 20 }}>
          All <strong style={{ color: '#c0392b' }}>{count} items</strong> will be permanently deleted.<br />This action cannot be undone — items cannot be restored.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onConfirm} style={{ padding: '9px 24px', borderRadius: 8, background: '#c0392b', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
            Yes, Permanently Delete
          </button>
          <button onClick={onCancel} style={{ padding: '9px 24px', borderRadius: 8, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Trash() {
  const { trash, save, logAct } = useApp();
  const [filterType, setFilterType] = useState('');
  const [search, setSearch] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [page, setPage] = useState(1);

  const types = [...new Set(trash.map((t) => t.type))];
  const filtered = trash.filter((t) => {
    if (filterType && t.type !== filterType) return false;
    if (search && !JSON.stringify(t.data).toUpperCase().includes(search.toUpperCase())) return false;
    return true;
  }).sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
  const paged = paginate(filtered, page, 20);

  function getLabel(item) {
    const d = item.data;
    return d?.name || d?.title || d?.task || d?.username || '(no name)';
  }

  async function handleClearAll() {
    if (clearing) return;
    setClearing(true);
    const count = trash.length;
    try {
      await deleteAllFromTable('workdesk-trash');
      await save('workdesk-trash', []);
      await logAct('TRASH CLEARED', `${count} items permanently deleted`);
    } finally {
      setClearing(false);
      setShowConfirm(false);
    }
  }

  const { restoreFromTrash } = useApp();

  return (
    <div>
      <ConfirmModal open={showConfirm} onConfirm={handleClearAll} onCancel={() => setShowConfirm(false)} count={trash.length} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>🗑️ Trash</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#6b7a90' }}>{trash.length} items (auto-delete after 1 year)</span>
          {trash.length > 0 && (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={clearing}
              style={{ padding: '7px 15px', borderRadius: 8, background: clearing ? '#e4eaf2' : '#fde8e8', color: clearing ? '#6b7a90' : '#c0392b', border: '1px solid #f5b7b1', cursor: clearing ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 12 }}
            >
              {clearing ? '⏳ Clearing...' : '🗑️ Clear All Permanently'}
            </button>
          )}
        </div>
      </div>

      <Alert variant="orange">Items are auto-deleted 1 year after trashing. Restore anytime using the ♻️ button.</Alert>

      <div style={{ display: 'flex', gap: 8, margin: '14px 0', flexWrap: 'wrap' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 SEARCH..." style={{ ...IS, flex: 1, minWidth: 160 }} />
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={IS}>
          <option value="">ALL TYPES</option>
          {types.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
        </select>
      </div>

      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Type', 'Item', 'Deleted By', 'Deleted On', 'Auto-Delete', 'Restore'].map((h) => (
              <th key={h} style={{ background: '#f3f7fc', padding: '9px 14px', textAlign: 'left', fontSize: 10.5, fontWeight: 800, color: '#6b7a90', letterSpacing: 0.8, textTransform: 'uppercase', borderBottom: '1px solid #d8e2ef' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {paged.items.length ? paged.items.map((item) => {
              const autoDelete = new Date(item.autoDeleteAt);
              const daysLeft = Math.ceil((autoDelete - new Date()) / (1000 * 60 * 60 * 24));
              return (
                <tr key={item.id} onMouseEnter={(e) => e.currentTarget.style.background = '#f8fbff'} onMouseLeave={(e) => e.currentTarget.style.background = 'white'}>
                  <td style={{ padding: '11px 14px' }}>
                    <span style={{ background: '#f3f7fc', color: '#6b7a90', padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{item.type}</span>
                  </td>
                  <td style={{ padding: '11px 14px', fontWeight: 700, fontSize: 13 }}>{getLabel(item)}</td>
                  <td style={{ padding: '11px 14px', fontSize: 11, color: '#6b7a90' }}>{item.deletedBy || '—'}</td>
                  <td style={{ padding: '11px 14px', fontSize: 11, color: '#6b7a90' }}>{fDate(item.deletedAt)}</td>
                  <td style={{ padding: '11px 14px', fontSize: 11 }}>
                    <span style={{ color: daysLeft < 30 ? '#c0392b' : '#6b7a90', fontWeight: daysLeft < 30 ? 800 : 600 }}>{daysLeft} days left</span>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <button onClick={() => restoreFromTrash(item.id)} style={{ padding: '5px 12px', borderRadius: 7, background: '#d4edda', color: '#1a7a4a', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>♻️ Restore</button>
                  </td>
                </tr>
              );
            }) : <tr><td colSpan={6}><EmptyState icon="🗑️" message="TRASH IS EMPTY" /></td></tr>}
          </tbody>
        </table>
        <div style={{ borderTop: '1px solid #d8e2ef', padding: '0 8px' }}>
          <Pagination {...paged} onPage={(p) => setPage(p)} />
        </div>
      </div>
    </div>
  );
}
