import { useState, useMemo } from 'react';
import { Modal } from './Modal';
import { DateRangePicker } from './DateRangePicker';
import { DeptTag, PriorityBadge } from './Badge';
import { wasCompletedLate, fDate, currentMonthRange, inDateRange } from '../../utils';

// Drill-down for tasks. Opened from a dashboard card click. The card's
// pre-filter narrows the initial dataset (e.g. "Delayed" card → only delayed
// tasks); the user can then layer search/dept/status/priority/date filters on
// top inside the modal. Date filtering respects the user's choice of field
// (created / lastDone / schedDate) so they can ask different questions of the
// same data without leaving the popup.
export function TasksDrilldownModal({ open, onClose, tasks = [], depts = [], preFilter = 'all', title = '📋 Tasks' }) {
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const initialRange = useMemo(() => currentMonthRange(), []);
  const [dateRange, setDateRange] = useState({ preset: 'currentMonth', from: initialRange.from, to: initialRange.to, field: 'created' });

  // 1. Apply preFilter from the card
  const preFiltered = useMemo(() => {
    switch (preFilter) {
      case 'completed': return tasks.filter((t) => t.status === 'done');
      case 'onTime':    return tasks.filter((t) => t.status === 'done' && !wasCompletedLate(t));
      case 'delayed':   return tasks.filter((t) => t.status === 'done' &&  wasCompletedLate(t));
      case 'pending':   return tasks.filter((t) => t.status === 'pending');
      case 'high':      return tasks.filter((t) => t.priority === 'high');
      default:          return tasks;
    }
  }, [tasks, preFilter]);

  // 2-4. Layer search + selects + date range
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return preFiltered
      .filter((t) => !q || (t.name || '').toLowerCase().includes(q))
      .filter((t) => !dept || t.dept === dept)
      .filter((t) => !status || t.status === status)
      .filter((t) => !priority || t.priority === priority)
      .filter((t) => {
        const field = dateRange.field;
        // lastDone may be full ISO; normalise to day-string for comparison
        const raw = field === 'lastDone' ? String(t.lastDone || '').slice(0, 10) : (t[field] || '');
        return inDateRange(raw, dateRange.from, dateRange.to);
      })
      // Most recent first
      .sort((a, b) => {
        const ka = a.updatedAt || a.lastDone || a.schedDate || a.created || '';
        const kb = b.updatedAt || b.lastDone || b.schedDate || b.created || '';
        return kb.localeCompare(ka);
      });
  }, [preFiltered, search, dept, status, priority, dateRange]);

  function clearFilters() {
    setSearch(''); setDept(''); setStatus(''); setPriority('');
    const r = currentMonthRange();
    setDateRange({ preset: 'currentMonth', from: r.from, to: r.to, field: 'created' });
  }

  const IS = { padding: '7px 10px', borderRadius: 7, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 12, color: '#1a2535', background: 'white', outline: 'none', fontWeight: 600 };

  const TD = { padding: '9px 12px', verticalAlign: 'middle', fontSize: 12 };
  const TH = { background: '#f3f7fc', padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#6b7a90', letterSpacing: 0.7, textTransform: 'uppercase', borderBottom: '1px solid #d8e2ef', whiteSpace: 'nowrap' };

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-2xl">
      {/* Filter row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 SEARCH TASK NAME…" style={{ ...IS, flex: 1, minWidth: 160 }} />
        <select value={dept} onChange={(e) => setDept(e.target.value)} style={IS}>
          <option value="">ALL DEPTS</option>
          {depts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={IS}>
          <option value="">ALL STATUS</option>
          <option value="pending">PENDING</option>
          <option value="done">DONE</option>
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
            { value: 'created',   label: 'Assign date (created)' },
            { value: 'lastDone',  label: 'Completion date' },
            { value: 'schedDate', label: 'Scheduled date' },
          ]}
        />
      </div>

      {/* Counter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 11.5, color: '#6b7a90' }}>
        <div>
          Showing <strong style={{ color: '#0d7377' }}>{rows.length}</strong> of <strong>{preFiltered.length}</strong>
          {preFilter !== 'all' && <> in <strong style={{ color: '#1a2535' }}>{title.replace(/^[^A-Z]+/, '').trim() || preFilter}</strong></>}
          {' '}({tasks.length} total in system)
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'white', border: '1px solid #d8e2ef', borderRadius: 9, overflow: 'hidden', maxHeight: '52vh', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              {['Status', 'Task', 'Dept', 'Assigned', 'Sched', 'Done By', 'Priority'].map((h) => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((t) => {
              const late = wasCompletedLate(t);
              const isDone = t.status === 'done';
              return (
                <tr key={t.id} style={{ background: late ? '#faf5ff' : 'white', borderBottom: '1px solid #f3f7fc' }}>
                  <td style={TD}>
                    {isDone && !late ? <span style={{ background: '#d4edda', color: '#155724', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 800 }}>✅ ON TIME</span>
                      : isDone && late ? <span style={{ background: '#ede9fe', color: '#4c1d95', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 800 }}>⏰ DELAYED</span>
                      : t.priority === 'high' ? <span style={{ background: '#fde8e8', color: '#7d1a1a', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 800 }}>⚠️ PENDING</span>
                      : <span style={{ background: '#fff3cd', color: '#7a4800', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 800 }}>⏳ PENDING</span>}
                  </td>
                  <td style={{ ...TD, fontWeight: 700 }}>{t.name}</td>
                  <td style={TD}><DeptTag name={t.dept} /></td>
                  <td style={{ ...TD, fontSize: 11 }}>{(t.assignedTo || []).join(', ') || '—'}</td>
                  <td style={{ ...TD, color: '#0d7377', fontWeight: 700, whiteSpace: 'nowrap' }}>{t.schedDate ? fDate(t.schedDate) : '—'}</td>
                  <td style={{ ...TD, fontSize: 11 }}>{t.doneBy || '—'}</td>
                  <td style={TD}><PriorityBadge priority={t.priority} /></td>
                </tr>
              );
            }) : (
              <tr><td colSpan={7} style={{ padding: 28, textAlign: 'center', color: '#6b7a90', fontSize: 12.5 }}>No tasks match the selected filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer hint */}
      <div style={{ marginTop: 10, fontSize: 10.5, color: '#6b7a90' }}>
        💡 For full task details and actions, open the <strong>Manage Tasks</strong> page.
      </div>
    </Modal>
  );
}