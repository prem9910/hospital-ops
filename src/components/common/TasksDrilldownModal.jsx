import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from './Modal';
import { DateRangePicker } from './DateRangePicker';
import { DeptTag, PriorityBadge, FreqBadge } from './Badge';
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
  scopeFn, // optional predicate (task) => boolean applied after preFilter
  manageUrl = '/tasks', // URL for the "Open in Manage Tasks" affordance.
                        // When null/undefined the button is hidden (use
                        // for pure read-only inline detail).
  manageLabel = '📋 Open in Manage Tasks →', // Button label. Override to
                                             // point the affordance at a
                                             // different destination.
}) {
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  // Mobile date-range trigger — collapsed by default on phones, tap to expand.
  // Desktop layout is unaffected (the trigger button is hidden via CSS).
  const [drOpen, setDrOpen] = useState(false);
  const initialRange = useMemo(() => currentMonthRange(), []);
  const [dateRange, setDateRange] = useState({ preset: 'currentMonth', from: initialRange.from, to: initialRange.to, field: 'created' });
  // Inline expansion state: row id whose detail is shown directly below
  // the row in the same table. null = no expansion. Single-expansion so
  // opening a new row auto-collapses the previous one.
  const [expandedId, setExpandedId] = useState(null);
  const navigate = useNavigate();

  // 1. Apply preFilter from the card, then scopeFn (e.g. "only tasks
  //    assigned to me"). scopeFn is optional — when undefined the
  //    preFilter result passes through unchanged (preserves main-admin
  //    behaviour where every row counts).
  const preFiltered = useMemo(() => {
    const base = (() => {
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
    })();
    return scopeFn ? base.filter(scopeFn) : base;
  }, [tasks, preFilter, scopeFn]);

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
      case 'Priority':
        return <td style={TD}><PriorityBadge priority={t.priority} /></td>;
      case 'Status': {
        // Compact status pill for popup lists — same colour scheme as the
        // main admin dashboard. Pending tasks show a priority-tinted pill
        // (high = red, others = amber) so the row reads at a glance.
        const late = wasCompletedLate(t);
        if (t.status === 'done') {
          return (
            <td style={TD}>
              <span style={{ background: late ? '#ede9fe' : '#d4edda', color: late ? '#4c1d95' : '#155724', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 800 }}>
                {late ? '⏰ DELAYED' : '✅ ON TIME'}
              </span>
            </td>
          );
        }
        const bg = t.priority === 'high' ? '#fde8e8' : '#fff3cd';
        const fg = t.priority === 'high' ? '#7d1a1a' : '#7a4800';
        return (
          <td style={TD}>
            <span style={{ background: bg, color: fg, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 800 }}>
              {t.priority === 'high' ? '⚠️ PENDING' : '⏳ PENDING'}
            </span>
          </td>
        );
      }
      case 'Result': {
        // Used by Total Completed / Performance Score popups — shows
        // whether the task was completed on time or with delay.
        const late = wasCompletedLate(t);
        if (t.status !== 'done') return <td style={TD}>—</td>;
        return (
          <td style={TD}>
            <span style={{ background: late ? '#ede9fe' : '#d4edda', color: late ? '#4c1d95' : '#155724', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 800 }}>
              {late ? '⏰ Delayed' : '✅ On Time'}
            </span>
          </td>
        );
      }
      case 'Action':
        return (
          <td style={TD}>
            <button
              // stopPropagation so the row click (mobile tap-to-expand)
              // doesn't fire when the user explicitly clicks the View button.
              onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === t.id ? null : t.id); }}
              style={{
                padding: '4px 12px', borderRadius: 6,
                background: expandedId === t.id ? '#334155' : '#0d7377',
                color: 'white', border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 800,
              }}
            >
              {expandedId === t.id ? '✕ Close' : '👁 View'}
            </button>
          </td>
        );
      default:
        return <td style={TD}>—</td>;
    }
  }

  // Compact label for the mobile date-range trigger button.
  // Shows the active preset name + the actual from/to when it's not a preset.
  const drLabel = (() => {
    if (dateRange.preset === 'currentMonth') return 'Current Month';
    if (dateRange.preset === 'last30') return 'Last 30 Days';
    if (dateRange.preset === 'custom') {
      return dateRange.from && dateRange.to ? `${dateRange.from} → ${dateRange.to}` : 'Custom Range';
    }
    return 'Date Range';
  })();

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-2xl">
      {/* Filter row — Status and Priority dropdowns removed: preFilter already scopes rows. */}
      <div className="modal-filter-row">
        <input className="modal-filter-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 SEARCH TASK NAME…" style={IS} />
        <select value={dept} onChange={(e) => setDept(e.target.value)} style={IS}>
          <option value="">ALL DEPTS</option>
          {depts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
        <button onClick={clearFilters} style={{ ...IS, cursor: 'pointer', color: '#0d7377', borderColor: '#0d7377', background: 'white' }}>↺ Clear</button>
      </div>

      {/* Date range — desktop shows inline, mobile shows a trigger button
          that expands the picker on tap. CSS controls which is visible. */}
      <button
        type="button"
        className="modal-dr-trigger"
        onClick={() => setDrOpen((v) => !v)}
        aria-expanded={drOpen}
      >
        <span>📅 Date Range: {drLabel}</span>
        <span style={{ fontSize: 10, color: '#6b7a90' }}>{drOpen ? '▲' : '▼'}</span>
      </button>
      <div className={`modal-dr-collapsible${drOpen ? ' is-open' : ''}`} style={{ marginBottom: 12 }}>
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

      {/* Table — columns come from the per-card `columns` prop. Clicking
          a row's View button toggles an inline detail panel directly below
          the row. The detail lives INSIDE the tbody's scrollable area so
          it can't get cropped behind the modal header. The wrap class adds
          horizontal scroll on narrow screens so columns don't squish. */}
      <div className="modal-table-wrap" style={{ background: 'white', border: '1px solid #d8e2ef', borderRadius: 9, overflow: 'auto', maxHeight: '52vh' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              {columns.map((h) => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((t) => {
              const isExpanded = expandedId === t.id;
              return (
                <FragmentRow
                  key={t.id}
                  task={t}
                  columns={columns}
                  renderCell={renderCell}
                  isExpanded={isExpanded}
                  onToggle={() => setExpandedId(isExpanded ? null : t.id)}
                  expandedNode={isExpanded ? (
                    <InlineTaskDetail
                      task={t}
                      onOpenManage={manageUrl ? () => { onClose(); navigate(manageUrl + (manageUrl.includes('?') ? '&' : '?') + 'focus=' + encodeURIComponent(t.id)); } : null}
                      onCollapse={() => setExpandedId(null)}
                      manageLabel={manageLabel}
                      manageUrl={manageUrl}
                    />
                  ) : null}
                />
              );
            }) : (
              <tr><td colSpan={columns.length} style={{ padding: 28, textAlign: 'center', color: '#6b7a90', fontSize: 12.5 }}>No tasks match the selected filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

// Wraps a data row + its optional inline expansion row inside a single
// React.Fragment so they render as siblings under the same key in tbody.
// (Returning two sibling <tr>s without Fragment from a map causes the
// second one to be hoisted out of the table in some renderers.)
function FragmentRow({ task, columns, renderCell, isExpanded, expandedNode, onToggle }) {
  return (
    <>
      <tr
        className="modal-table-row"
        onClick={onToggle}
        style={{ background: wasCompletedLate(task) ? '#faf5ff' : 'white', borderBottom: '1px solid #f3f7fc', cursor: 'pointer' }}
      >
        {columns.map((col) => renderCell(col, task))}
      </tr>
      {isExpanded && expandedNode}
    </>
  );
}

// Inline detail panel rendered inside the table tbody directly below the
// clicked row. Mirrors the read-only TaskDetailModal body (no action
// buttons — those are gated on `onDone`/`canEdit` etc. and the dashboard
// drilldown is intentionally read-only).
function InlineTaskDetail({ task, onOpenManage, onCollapse, manageLabel, manageUrl }) {
  const isDone = task.status === 'done';
  const late = wasCompletedLate(task);
  const actHtml = (task.activityLog || []);
  const LBL = { fontSize: 10.5, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 110, paddingTop: 2 };
  const CELL = { fontSize: 13, fontWeight: 600, color: '#1a2535', flex: 1 };
  return (
    <tr style={{ background: '#f0f7fb' }}>
      <td colSpan={99} style={{ padding: '14px 18px', borderBottom: '2px solid #d8e2ef' }}>
        {/* Status banner */}
        {isDone && !late ? (
          <div style={{ background: '#d4edda', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>✅</span>
            <div><div style={{ fontWeight: 800, color: '#155724' }}>COMPLETED ON TIME</div>
              <div style={{ fontSize: 11.5, color: '#1a7a4a' }}>By {task.doneBy || '—'} at {task.doneTime || '—'}</div></div>
          </div>
        ) : isDone && late ? (
          <div style={{ background: '#ede9fe', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
            <div style={{ fontWeight: 800, color: '#4c1d95' }}>⏰ COMPLETED WITH DELAY</div>
          </div>
        ) : (
          <div style={{ background: '#fff3cd', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
            <div style={{ fontWeight: 800, color: '#7a4800' }}>⏳ PENDING</div>
          </div>
        )}

        <div className="inline-task-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* Task Information */}
          <Panel title="📋 Task Information">
            <DetailRow label="Task Name"><strong>{task.name}</strong></DetailRow>
            <DetailRow label="Department"><DeptTag name={task.dept} /></DetailRow>
            <DetailRow label="Priority"><PriorityBadge priority={task.priority} /></DetailRow>
            <DetailRow label="Frequency"><FreqBadge freq={task.freq} /></DetailRow>
            <DetailRow label="Sched. Date">
              <span style={{ color: '#0d7377', fontWeight: 800 }}>
                {task.schedDate ? fDate(task.schedDate) + (task.time ? ' — ' + task.time : '') : '—'}
              </span>
            </DetailRow>
            {task.notes && <DetailRow label="Notes"><span style={{ color: '#6b7a90' }}>{task.notes}</span></DetailRow>}
          </Panel>

          {/* Assigned By / To */}
          <Panel title="👤 Assigned By / Assigned To">
            {task.createdBy && (
              <DetailRow label="Assigned By">
                <span style={{ background: '#e8f4fd', color: '#0d7377', padding: '4px 10px', borderRadius: 8, fontWeight: 800, fontSize: 12 }}>
                  👤 {task.createdBy}
                </span>
              </DetailRow>
            )}
            <DetailRow label="Assigned To">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(task.assignedTo || []).map((name, i) => (
                  <div key={i} style={{ background: '#0b1e3d', color: 'white', borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 700 }}>
                    {name}
                    {task.assigneeEmails?.[i] && <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.5)' }}>{task.assigneeEmails[i]}</div>}
                  </div>
                ))}
              </div>
            </DetailRow>
          </Panel>
        </div>

        {isDone && (
          <Panel title="✅ Completion Details">
            <DetailRow label="Done By"><strong>{task.doneBy || '—'}</strong></DetailRow>
            <DetailRow label="Done At"><span style={{ color: '#0d7377', fontWeight: 800 }}>{task.doneTime || '—'}</span></DetailRow>
            {task.doneRemark && <DetailRow label="Remark">{task.doneRemark}</DetailRow>}
          </Panel>
        )}

        {late && task.delayReason && (
          <div style={{ background: '#faf5ff', border: '1.5px solid #c4b5fd', borderRadius: 8, padding: '10px 13px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#6d28d9', marginBottom: 6 }}>⏰ DELAY REASON</div>
            <div style={{ fontSize: 13, color: '#6d28d9', fontWeight: 600 }}>{task.delayReason}</div>
          </div>
        )}

        <Panel title="📜 Activity Log">
          {actHtml.length ? actHtml.map((a, i) => (
            <div key={i} style={{ padding: '5px 0', borderBottom: '1px solid #e2e8f0', fontSize: 11.5 }}>
              <strong>{a.by}</strong> — {a.action} <span style={{ color: '#6b7a90' }}>{a.details || ''}</span>
              <span style={{ float: 'right', color: '#6b7a90', fontSize: 10.5 }}>{a.at}</span>
            </div>
          )) : <span style={{ color: '#6b7a90', fontSize: 12 }}>No activity</span>}
        </Panel>

        {/* Action row — primary CTA + Collapse. The primary CTA is hidden
            when `onOpenManage` is null (e.g. staff users without /tasks
            permission) so the inline detail remains read-only. */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {onOpenManage && (
            <button
              onClick={onOpenManage}
              style={{
                padding: '9px 16px', borderRadius: 8,
                background: '#0d7377', color: 'white',
                border: 'none', cursor: 'pointer',
                fontWeight: 800, fontSize: 12.5,
              }}
            >
              {manageLabel}
            </button>
          )}
          <button
            onClick={onCollapse}
            style={{
              padding: '9px 14px', borderRadius: 8,
              background: 'white', color: '#6b7a90',
              border: '1.5px solid #d8e2ef', cursor: 'pointer',
              fontWeight: 800, fontSize: 12.5,
            }}
          >
            ✕ Collapse
          </button>
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: '#6b7a90', alignSelf: 'center' }}>
            {manageUrl === '/tasks'
              ? '💡 For Edit / Delete / Mark Complete, open in Manage Tasks.'
              : manageUrl
                ? '💡 This task is also listed in your dashboard.'
                : '💡 Read-only view.'}
          </span>
        </div>
      </td>
    </tr>
  );
}

function Panel({ title, children }) {
  return (
    <div style={{ background: '#f8fbff', borderRadius: 9, padding: '12px 14px', marginBottom: 10, border: '1px solid #d8e2ef' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 5, alignItems: 'flex-start' }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 110, paddingTop: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2535', flex: 1 }}>{children}</div>
    </div>
  );
}