import { useState, useMemo } from 'react';
import { Modal } from './Modal';
import { DateRangePicker } from './DateRangePicker';
import { DeptTag, PriorityBadge, StatusBadge } from './Badge';
import { fDate, currentMonthRange, inDateRange, isEscalatedIssue } from '../../utils';

// Drill-down for issues. preFilter maps:
//   'open'      → status === 'open'
//   'escalated' → priority === 'high' && status === 'open'
//   'resolved'  → status === 'resolved'
//   'all'       → no pre-filter
// 'date' field = reported date (YYYY-MM-DD). 'resolvedAt' is full ISO so we
// slice to day before passing to inDateRange.
export function IssuesDrilldownModal({ open, onClose, issues = [], depts = [], preFilter = 'all', title = '⚠️ Issues' }) {
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const initialRange = useMemo(() => currentMonthRange(), []);
  const [dateRange, setDateRange] = useState({ preset: 'currentMonth', from: initialRange.from, to: initialRange.to, field: 'date' });

  const preFiltered = useMemo(() => {
    switch (preFilter) {
      case 'open':      return issues.filter((i) => i.status === 'open');
      case 'escalated': return issues.filter(isEscalatedIssue);
      case 'resolved':  return issues.filter((i) => i.status === 'resolved');
      case 'in-progress': return issues.filter((i) => i.status === 'in-progress');
      default:          return issues;
    }
  }, [issues, preFilter]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return preFiltered
      .filter((i) => !q || (i.title || '').toLowerCase().includes(q) || (i.desc || '').toLowerCase().includes(q))
      .filter((i) => !dept || i.dept === dept)
      .filter((i) => !status || i.status === status)
      .filter((i) => !priority || i.priority === priority)
      .filter((i) => {
        const field = dateRange.field;
        const raw = field === 'resolvedAt' ? String(i.resolvedAt || '').slice(0, 10) : (i[field] || '');
        return inDateRange(raw, dateRange.from, dateRange.to);
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [preFiltered, search, dept, status, priority, dateRange]);

  function clearFilters() {
    setSearch(''); setDept(''); setStatus(''); setPriority('');
    const r = currentMonthRange();
    setDateRange({ preset: 'currentMonth', from: r.from, to: r.to, field: 'date' });
  }

  const IS = { padding: '7px 10px', borderRadius: 7, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 12, color: '#1a2535', background: 'white', outline: 'none', fontWeight: 600 };
  const TD = { padding: '9px 12px', verticalAlign: 'middle', fontSize: 12 };
  const TH = { background: '#f3f7fc', padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#6b7a90', letterSpacing: 0.7, textTransform: 'uppercase', borderBottom: '1px solid #d8e2ef', whiteSpace: 'nowrap' };

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-2xl">
      {/* Filter row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 SEARCH ISSUE…" style={{ ...IS, flex: 1, minWidth: 160 }} />
        <select value={dept} onChange={(e) => setDept(e.target.value)} style={IS}>
          <option value="">ALL DEPTS</option>
          {depts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={IS}>
          <option value="">ALL STATUS</option>
          <option value="open">OPEN</option>
          <option value="in-progress">IN PROGRESS</option>
          <option value="resolved">RESOLVED</option>
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} style={IS}>
          <option value="">ALL PRIORITY</option>
          <option value="high">🔴 HIGH</option>
          <option value="medium">🟡 MEDIUM</option>
          <option value="low">🟢 LOW</option>
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
            { value: 'date',       label: 'Reported date' },
            { value: 'resolvedAt', label: 'Resolved date' },
          ]}
        />
      </div>

      {/* Counter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 11.5, color: '#6b7a90' }}>
        <div>
          Showing <strong style={{ color: '#0d7377' }}>{rows.length}</strong> of <strong>{preFiltered.length}</strong>
          {' '}({issues.length} total in system)
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'white', border: '1px solid #d8e2ef', borderRadius: 9, overflow: 'hidden', maxHeight: '52vh', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              {['Priority', 'Issue', 'Dept', 'Reporter', 'Date', 'Status', 'Resolution'].map((h) => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((i) => (
              <tr key={i.id} style={{ background: 'white', borderBottom: '1px solid #f3f7fc' }}>
                <td style={TD}><PriorityBadge priority={i.priority} /></td>
                <td style={{ ...TD, fontWeight: 700 }}>
                  {i.title}
                  {i.desc && <div style={{ fontSize: 10.5, color: '#6b7a90', fontWeight: 500, marginTop: 2 }}>{i.desc.length > 60 ? i.desc.slice(0, 60) + '…' : i.desc}</div>}
                </td>
                <td style={TD}><DeptTag name={i.dept} /></td>
                <td style={{ ...TD, fontSize: 11 }}>{i.reporter || '—'}</td>
                <td style={{ ...TD, fontSize: 11, color: '#6b7a90' }}>{fDate(i.date)}</td>
                <td style={TD}><StatusBadge status={i.status} /></td>
                <td style={{ ...TD, fontSize: 11, maxWidth: 160 }}>
                  {i.resolveRemark ? <span style={{ color: '#1a7a4a' }}>✅ {i.resolveRemark.length > 50 ? i.resolveRemark.slice(0, 50) + '…' : i.resolveRemark}{i.resolveBy && <div style={{ color: '#6b7a90', fontSize: 10 }}>By: {i.resolveBy}</div>}</span> : '—'}
                </td>
              </tr>
            )) : (
              <tr><td colSpan={7} style={{ padding: 28, textAlign: 'center', color: '#6b7a90', fontSize: 12.5 }}>No issues match the selected filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, fontSize: 10.5, color: '#6b7a90' }}>
        💡 For full issue details and actions, open the <strong>Issues</strong> page.
      </div>
    </Modal>
  );
}