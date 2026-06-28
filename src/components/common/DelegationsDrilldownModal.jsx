import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from './Modal';
import { DateRangePicker } from './DateRangePicker';
import { DeptTag } from './Badge';
import { fDate, currentMonthRange, inDateRange } from '../../utils';

// Per-card column spec for delegations. The Status dropdown was removed
// because the dashboard card's preFilter already scopes to one status
// (pending / accepted / done / overdue) — an in-modal Status filter
// would contradict the card's intent.
//
// Supported columns:
//   'Task' | 'Doer' | 'Dept' | 'Status' | 'Due Date' | 'Created' | 'Ext.' | 'Action'
const DEFAULT_COLUMNS = ['Task', 'Doer', 'Due Date', 'Action'];

// Drill-down for delegations. Date field can be:
//   'createdAt'  → when the delegation was issued (YYYY-MM-DD)
//   'dueDate'    → the deadline (YYYY-MM-DD)
//   'actualDate' → when it was marked done (YYYY-MM-DD, may be empty)
export function DelegationsDrilldownModal({
  open, onClose,
  delegations = [], depts = [],
  preFilter = 'all',
  title = '📤 Delegations',
  columns = DEFAULT_COLUMNS,
  scopeFn, // optional predicate (delegation) => boolean applied after preFilter
}) {
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  // Mobile date-range trigger — collapsed by default on phones, tap to expand.
  // Desktop layout is unaffected (the trigger button is hidden via CSS).
  const [drOpen, setDrOpen] = useState(false);
  const initialRange = useMemo(() => currentMonthRange(), []);
  const [dateRange, setDateRange] = useState({ preset: 'currentMonth', from: initialRange.from, to: initialRange.to, field: 'createdAt' });
  // Inline expansion state: row id whose detail is shown directly below
  // the row in the same table. null = no expansion.
  const [expandedId, setExpandedId] = useState(null);
  const navigate = useNavigate();

  const preFiltered = useMemo(() => {
    const base = (() => {
      switch (preFilter) {
        case 'pending':  return delegations.filter((d) => d.status === 'pending');
        case 'accepted': return delegations.filter((d) => d.status === 'accepted');
        case 'done':     return delegations.filter((d) => d.status === 'done');
        case 'overdue':  return delegations.filter((d) => (d.status === 'pending' || d.status === 'accepted') && d.dueDate && d.dueDate < currentMonthRange().from);
        default:         return delegations;
      }
    })();
    return scopeFn ? base.filter(scopeFn) : base;
  }, [delegations, preFilter, scopeFn]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return preFiltered
      .filter((d) => !q || (d.task || '').toLowerCase().includes(q) || (d.remarks || '').toLowerCase().includes(q))
      .filter((d) => !dept || d.dept === dept)
      .filter((d) => inDateRange(d[dateRange.field], dateRange.from, dateRange.to))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [preFiltered, search, dept, dateRange]);

  function clearFilters() {
    setSearch(''); setDept('');
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

  // Per-column cell renderer for delegations.
  function renderCell(col, d) {
    switch (col) {
      case 'Task':
        return (
          <td style={{ ...TD, fontWeight: 700, maxWidth: 240, color: d.task ? '#0b1e3d' : '#c0392b' }}>
            {d.task || '— Untitled task —'}
            {d.remarks && <div style={{ fontSize: 10.5, color: '#6b7a90', fontWeight: 500, marginTop: 2 }}>{d.remarks.length > 50 ? d.remarks.slice(0, 50) + '…' : d.remarks}</div>}
          </td>
        );
      case 'Doer':
        return <td style={{ ...TD, fontSize: 11 }}>{d.doerName}</td>;
      case 'Dept':
        return <td style={TD}><DeptTag name={d.dept} /></td>;
      case 'Status':
        return <td style={TD}><StatusPill s={d.status} /></td>;
      case 'Due Date':
        return <td style={{ ...TD, fontSize: 11, whiteSpace: 'nowrap', color: '#0d7377', fontWeight: 700 }}>{fDate(d.dueDate)}</td>;
      case 'Created':
        return <td style={{ ...TD, fontSize: 11, color: '#6b7a90' }}>{fDate(d.createdAt)}</td>;
      case 'Ext.':
        return <td style={{ ...TD, fontSize: 11, color: '#6d28d9', fontWeight: 800 }}>{(d.extensionRequests || d.extensions || []).length}</td>;
      case 'Action':
        return (
          <td style={TD}>
            <button
              // stopPropagation so the row click (mobile tap-to-expand)
              // doesn't fire when the user explicitly clicks the View button.
              onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === d.id ? null : d.id); }}
              style={{
                padding: '4px 12px', borderRadius: 6,
                background: expandedId === d.id ? '#334155' : '#0d7377',
                color: 'white', border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 800,
              }}
            >
              {expandedId === d.id ? '✕ Close' : '👁 View'}
            </button>
          </td>
        );
      default:
        return <td style={TD}>—</td>;
    }
  }

  // Compact label for the mobile date-range trigger button.
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
      {/* Filter row — Status dropdown removed: preFilter already scopes rows. */}
      <div className="modal-filter-row">
        <input className="modal-filter-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 SEARCH TASK / REMARKS…" style={IS} />
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

      {/* Table — columns come from the per-card `columns` prop. Clicking
          a row's View button toggles an inline detail panel directly below
          the row. The detail lives INSIDE the tbody's scrollable area so
          it can't get cropped behind the modal header. */}
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
            {rows.length ? rows.map((d) => {
              const isExpanded = expandedId === d.id;
              return (
                <FragmentRow
                  key={d.id}
                  delegation={d}
                  columns={columns}
                  renderCell={renderCell}
                  isExpanded={isExpanded}
                  onToggle={() => setExpandedId(isExpanded ? null : d.id)}
                  expandedNode={isExpanded ? (
                    <tr style={{ background: '#f0f7fb' }}>
                      <td colSpan={99} style={{ padding: '14px 18px', borderBottom: '2px solid #d8e2ef' }}>
                        <DelegationDetailPanel d={d} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                          <button
                            onClick={() => { onClose(); navigate('/delegation?focus=' + encodeURIComponent(d.id)); }}
                            style={{
                              padding: '9px 16px', borderRadius: 8,
                              background: '#0d7377', color: 'white',
                              border: 'none', cursor: 'pointer',
                              fontWeight: 800, fontSize: 12.5,
                            }}
                          >
                            📋 Open in Delegations →
                          </button>
                          <button
                            onClick={() => setExpandedId(null)}
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
                            💡 For Accept / Reject / Extension actions, open in Delegations page.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                />
              );
            }) : (
              <tr><td colSpan={columns.length} style={{ padding: 28, textAlign: 'center', color: '#6b7a90', fontSize: 12.5 }}>No delegations match the selected filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

// Fragment wrapper so each row + its optional inline expansion render as
// siblings under the same key inside tbody.
function FragmentRow({ delegation, columns, renderCell, isExpanded, expandedNode, onToggle }) {
  return (
    <>
      <tr
        className="modal-table-row"
        onClick={onToggle}
        style={{ background: 'white', borderBottom: '1px solid #f3f7fc', cursor: 'pointer' }}
      >
        {columns.map((col) => renderCell(col, delegation))}
      </tr>
      {isExpanded && expandedNode}
    </>
  );
}

// Read-only delegation panel — inline helper inside the drilldown row.
function DelegationDetailPanel({ d }) {
  const TD = { padding: '9px 12px', verticalAlign: 'middle', fontSize: 12 };
  const LBL = { fontSize: 10.5, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 110, paddingTop: 2 };
  return (
    <div>
      <div style={{ background: '#f8fbff', borderRadius: 9, padding: '12px 14px', marginBottom: 10, border: '1px solid #d8e2ef' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>📋 Delegation</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 5, alignItems: 'flex-start' }}>
          <div style={LBL}>Task</div>
          <div style={{ ...TD, flex: 1, fontWeight: 700 }}>{d.task || '—'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 5, alignItems: 'flex-start' }}>
          <div style={LBL}>Doer</div>
          <div style={{ ...TD, flex: 1 }}>{d.doerName || '—'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 5, alignItems: 'flex-start' }}>
          <div style={LBL}>Department</div>
          <div style={{ ...TD, flex: 1 }}><DeptTag name={d.dept} /></div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 5, alignItems: 'flex-start' }}>
          <div style={LBL}>Status</div>
          <div style={{ ...TD, flex: 1 }}>{d.status || '—'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 5, alignItems: 'flex-start' }}>
          <div style={LBL}>Due Date</div>
          <div style={{ ...TD, flex: 1, color: '#0d7377', fontWeight: 700 }}>{fDate(d.dueDate)}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 5, alignItems: 'flex-start' }}>
          <div style={LBL}>Created</div>
          <div style={{ ...TD, flex: 1 }}>{fDate(d.createdAt)}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 5, alignItems: 'flex-start' }}>
          <div style={LBL}>Extensions</div>
          <div style={{ ...TD, flex: 1 }}>{(d.extensionRequests || d.extensions || []).length}</div>
        </div>
      </div>
      {d.remarks && (
        <div style={{ background: '#f8fbff', borderRadius: 9, padding: '12px 14px', marginBottom: 10, border: '1px solid #d8e2ef' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>📝 Remarks</div>
          <div style={{ fontSize: 13, color: '#1a2535', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{d.remarks}</div>
        </div>
      )}
    </div>
  );
}