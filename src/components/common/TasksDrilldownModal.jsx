import { useState, useMemo } from 'react';
import { Modal } from './Modal';
import { DateRangePicker } from './DateRangePicker';
import { DeptTag } from './Badge';
import { TaskDetailModal } from './TaskDetailModal';
import { wasCompletedLate, fDate, currentMonthRange, inDateRange, toDay } from '../../utils';

// "Pending and due today" — matches the dashboard pending card so the
// drill-down opens on the same scope the user just clicked. Upcoming
// scheduled tasks are excluded; the user can widen the scope later via
// the date-range picker (set field=schedDate and pick a wider range).
const isCurrentDatePending = (t) => {
  if (t.status !== 'pending') return false;
  if (!t.schedDate) return true;
  return t.schedDate <= toDay();
};

// Per-card column spec for tasks. Each dashboard card passes its own list,
// so the popup shows ONLY the data that matches that card's category —
// Status and Priority dropdowns are intentionally absent (the card's
// preFilter already scopes the rows, an in-modal Status dropdown would
// contradict that scope).
//
// Supported columns:
//   'Sched. Date' | 'Task' | 'Done By' | 'Assigned' | 'Action'
const DEFAULT_COLUMNS = ['Sched. Date', 'Task', 'Done By', 'Action'];

export function TasksDrilldownModal({
  open, onClose,
  tasks = [], depts = [],
  preFilter = 'all',
  title = '📋 Tasks',
  columns = DEFAULT_COLUMNS,
}) {
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const initialRange = useMemo(() => currentMonthRange(), []);
  const [dateRange, setDateRange] = useState({ preset: 'currentMonth', from: initialRange.from, to: initialRange.to, field: 'created' });
  // Selected row → opens the read-only TaskDetailModal so the user can
  // see every field on the task without leaving the dashboard popup.
  const [selectedTask, setSelectedTask] = useState(null);

  // 1. Apply preFilter from the card
  const preFiltered = useMemo(() => {
    switch (preFilter) {
      case 'completed': return tasks.filter((t) => t.status === 'done');
      case 'onTime':    return tasks.filter((t) => t.status === 'done' && !wasCompletedLate(t));
      case 'delayed':   return tasks.filter((t) => t.status === 'done' &&  wasCompletedLate(t));
      // "Pending" drill-down matches the dashboard pending card scope:
      // current-date pending only. Upcoming tasks can still be explored by
      // widening the date range on the schedDate field.
      case 'pending':   return tasks.filter(isCurrentDatePending);
      case 'high':      return tasks.filter((t) => t.priority === 'high');
      default:          return tasks;
    }
  }, [tasks, preFilter]);

  // 2-4. Layer search + dept + date range. Status/Priority dropdowns were
  // removed because the card's preFilter already scopes the rows.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return preFiltered
      .filter((t) => !q || (t.name || '').toLowerCase().includes(q))
      .filter((t) => !dept || t.dept === dept)
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
  }, [preFiltered, search, dept, dateRange]);

  function clearFilters() {
    setSearch(''); setDept('');
    const r = currentMonthRange();
    setDateRange({ preset: 'currentMonth', from: r.from, to: r.to, field: 'created' });
  }

  const IS = { padding: '7px 10px', borderRadius: 7, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 12, color: '#1a2535', background: 'white', outline: 'none', fontWeight: 600 };
  const TD = { padding: '9px 12px', verticalAlign: 'middle', fontSize: 12 };
  const TH = { background: '#f3f7fc', padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#6b7a90', letterSpacing: 0.7, textTransform: 'uppercase', borderBottom: '1px solid #d8e2ef', whiteSpace: 'nowrap' };

  // Per-column cell renderer. Keeping it switch-based (not a map of
  // components) so it's easy to grep the column → field mapping.
  function renderCell(col, t) {
    switch (col) {
      case 'Sched. Date':
        return <td style={{ ...TD, color: '#0d7377', fontWeight: 700, whiteSpace: 'nowrap' }}>{t.schedDate ? fDate(t.schedDate) : '—'}</td>;
      case 'Task':
        return (
          <td style={{ ...TD, fontWeight: 700, maxWidth: 280 }}>
            {t.name}
            {t.dept && <div style={{ fontSize: 10, color: '#6b7a90', fontWeight: 600, marginTop: 2 }}><DeptTag name={t.dept} /></div>}
          </td>
        );
      case 'Done By':
        return <td style={{ ...TD, fontSize: 11 }}>{t.doneBy || '—'}</td>;
      case 'Assigned':
        return <td style={{ ...TD, fontSize: 11 }}>{(t.assignedTo || []).join(', ') || '—'}</td>;
      case 'Action':
        return (
          <td style={TD}>
            <button
              onClick={() => setSelectedTask(t)}
              style={{ padding: '4px 12px', borderRadius: 6, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 800 }}
            >
              👁 View
            </button>
          </td>
        );
      default:
        return <td style={TD}>—</td>;
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-2xl">
      {/* Filter row — Status and Priority dropdowns removed: preFilter already scopes rows. */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 SEARCH TASK NAME…" style={{ ...IS, flex: 1, minWidth: 160 }} />
        <select value={dept} onChange={(e) => setDept(e.target.value)} style={IS}>
          <option value="">ALL DEPTS</option>
          {depts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
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

      {/* Table — columns come from the per-card `columns` prop. */}
      <div style={{ background: 'white', border: '1px solid #d8e2ef', borderRadius: 9, overflow: 'hidden', maxHeight: '52vh', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              {columns.map((h) => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((t) => (
              <tr key={t.id} style={{ background: wasCompletedLate(t) ? '#faf5ff' : 'white', borderBottom: '1px solid #f3f7fc' }}>
                {columns.map((col) => renderCell(col, t))}
              </tr>
            )) : (
              <tr><td colSpan={columns.length} style={{ padding: 28, textAlign: 'center', color: '#6b7a90', fontSize: 12.5 }}>No tasks match the selected filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Read-only task detail — opened by the row's View button. The
          action callbacks are null so the modal renders without
          Edit/Delete/Mark-Complete buttons (dashboard is read-only). */}
      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        currentUser={null}
        currentRole={null}
      />
    </Modal>
  );
}