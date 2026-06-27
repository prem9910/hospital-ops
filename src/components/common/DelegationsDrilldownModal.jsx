import { useState, useMemo } from 'react';
import { Modal } from './Modal';
import { DateRangePicker } from './DateRangePicker';
import { DeptTag } from './Badge';
import { fDate, currentMonthRange, inDateRange } from '../../utils';

// Drill-down for delegations. Date field can be:
//   'createdAt'  → when the delegation was issued (YYYY-MM-DD)
//   'dueDate'    → the deadline (YYYY-MM-DD)
//   'actualDate' → when it was marked done (YYYY-MM-DD, may be empty)
export function DelegationsDrilldownModal({ open, onClose, delegations = [], depts = [], preFilter = 'all', title = '📤 Delegations' }) {
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [status, setStatus] = useState('');
  const initialRange = useMemo(() => currentMonthRange(), []);
  const [dateRange, setDateRange] = useState({ preset: 'currentMonth', from: initialRange.from, to: initialRange.to, field: 'createdAt' });

  const preFiltered = useMemo(() => {
    switch (preFilter) {
      case 'pending':  return delegations.filter((d) => d.status === 'pending');
      case 'accepted': return delegations.filter((d) => d.status === 'accepted');
      case 'done':     return delegations.filter((d) => d.status === 'done');
      case 'overdue':  return delegations.filter((d) => (d.status === 'pending' || d.status === 'accepted') && d.dueDate && d.dueDate < currentMonthRange().from);
      default:         return delegations;
    }
  }, [delegations, preFilter]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return preFiltered
      .filter((d) => !q || (d.task || '').toLowerCase().includes(q) || (d.remarks || '').toLowerCase().includes(q))
      .filter((d) => !dept || d.dept === dept)
      .filter((d) => !status || d.status === status)
      .filter((d) => inDateRange(d[dateRange.field], dateRange.from, dateRange.to))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [preFiltered, search, dept, status, dateRange]);

  function clearFilters() {
    setSearch(''); setDept(''); setStatus('');
    const r = currentMonthRange();
    setDateRange({ preset: 'currentMonth', from: r.from, to: r.to, field: 'createdAt' });
  }

  const IS = { padding: '7px 10px', borderRadius: 7, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 12, color: '#1a2535', background: 'white', outline: 'none', fontWeight: 600 };
  const TD = { padding: '9px 12px', verticalAlign: 'middle', fontSize: 12 };
  const TH = { background: '#f3f7fc', padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#6b7a90', letterSpacing: 0.7, textTransform: 'uppercase', borderBottom: '1px solid #d8e2ef', whiteSpace: 'nowrap' };

  const STATUS_COLORS = { pending: '#d4920a', accepted: '#0d7377', done: '#1a7a4a', 'extension-requested': '#6d28d9', extended: '#c05a00', rejected: '#c0392b' };

  function StatusPill({ s }) {
    return (
      <span style={{ background: STATUS_COLORS[s] || '#6b7a90', color: 'white', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>
        {s || '—'}
      </span>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-2xl">
      {/* Filter row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 SEARCH TASK / REMARKS…" style={{ ...IS, flex: 1, minWidth: 160 }} />
        <select value={dept} onChange={(e) => setDept(e.target.value)} style={IS}>
          <option value="">ALL DEPTS</option>
          {depts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={IS}>
          <option value="">ALL STATUS</option>
          <option value="pending">PENDING</option>
          <option value="accepted">ACCEPTED</option>
          <option value="done">DONE</option>
          <option value="extension-requested">EXT. REQ.</option>
          <option value="extended">EXTENDED</option>
          <option value="rejected">REJECTED</option>
        </select>
        <button onClick={clearFilters} style={{ ...IS, cursor: 'pointer', color: '#0d7377', borderColor: '#0d7377', background: 'white' }}>↺ Clear</button>
      </div>

      {/* Date range */}
      <div style={{ marginBottom: 12 }}>
        <DateRangePicker
          value={dateRange}
          onChange={setDateRange}
          showField
          fieldOptions={[
            { value: 'createdAt',  label: 'Created date' },
            { value: 'dueDate',    label: 'Due date' },
            { value: 'actualDate', label: 'Completion date' },
          ]}
        />
      </div>

      {/* Counter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 11.5, color: '#6b7a90' }}>
        <div>
          Showing <strong style={{ color: '#0d7377' }}>{rows.length}</strong> of <strong>{preFiltered.length}</strong>
          {' '}({delegations.length} total in system)
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'white', border: '1px solid #d8e2ef', borderRadius: 9, overflow: 'hidden', maxHeight: '52vh', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              {['Task', 'Doer', 'Dept', 'Status', 'Due Date', 'Created', 'Ext.'].map((h) => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((d) => (
              <tr key={d.id} style={{ background: 'white', borderBottom: '1px solid #f3f7fc' }}>
                <td style={{ ...TD, fontWeight: 700, maxWidth: 240, color: d.task ? '#0b1e3d' : '#c0392b' }}>
                  {d.task || '— Untitled task —'}
                  {d.remarks && <div style={{ fontSize: 10.5, color: '#6b7a90', fontWeight: 500, marginTop: 2 }}>{d.remarks.length > 50 ? d.remarks.slice(0, 50) + '…' : d.remarks}</div>}
                </td>
                <td style={{ ...TD, fontSize: 11 }}>{d.doerName}</td>
                <td style={TD}><DeptTag name={d.dept} /></td>
                <td style={TD}><StatusPill s={d.status} /></td>
                <td style={{ ...TD, fontSize: 11, whiteSpace: 'nowrap', color: '#0d7377', fontWeight: 700 }}>{fDate(d.dueDate)}</td>
                <td style={{ ...TD, fontSize: 11, color: '#6b7a90' }}>{fDate(d.createdAt)}</td>
                <td style={{ ...TD, fontSize: 11, color: '#6d28d9', fontWeight: 800 }}>{(d.extensionRequests || d.extensions || []).length}</td>
              </tr>
            )) : (
              <tr><td colSpan={7} style={{ padding: 28, textAlign: 'center', color: '#6b7a90', fontSize: 12.5 }}>No delegations match the selected filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, fontSize: 10.5, color: '#6b7a90' }}>
        💡 For full delegation details and actions, open the <strong>Delegation Tracker</strong> page.
      </div>
    </Modal>
  );
}