import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from './Modal';
import { DateRangePicker } from './DateRangePicker';
import { DeptTag, PriorityBadge, StatusBadge } from './Badge';
import { fDate, currentMonthRange, inDateRange, isEscalatedIssue } from '../../utils';

// Per-card column spec for issues. Each dashboard card passes its own list.
// Status and Priority dropdowns were removed because the card's preFilter
// already scopes the rows.
//
// Supported columns:
//   'Date' | 'Issue' | 'Reporter' | 'Resolved By' | 'Status' | 'Priority' | 'Action'
const DEFAULT_COLUMNS = ['Date', 'Issue', 'Reporter', 'Action'];

// Drill-down for issues. preFilter maps:
//   'open'      → status === 'open'
//   'escalated' → priority === 'high' && status === 'open'
//   'resolved'  → status === 'resolved'
//   'all'       → no pre-filter
// 'date' field = reported date (YYYY-MM-DD). 'resolvedAt' is full ISO so we
// slice to day before passing to inDateRange.
export function IssuesDrilldownModal({
  open, onClose,
  issues = [], depts = [],
  preFilter = 'all',
  title = '⚠️ Issues',
  columns = DEFAULT_COLUMNS,
}) {
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const initialRange = useMemo(() => currentMonthRange(), []);
  const [dateRange, setDateRange] = useState({ preset: 'currentMonth', from: initialRange.from, to: initialRange.to, field: 'date' });
  // Inline expansion state: row id whose detail is shown directly below
  // the row in the same table. null = no expansion.
  const [expandedId, setExpandedId] = useState(null);
  const navigate = useNavigate();

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
      .filter((i) => {
        const field = dateRange.field;
        const raw = field === 'resolvedAt' ? String(i.resolvedAt || '').slice(0, 10) : (i[field] || '');
        return inDateRange(raw, dateRange.from, dateRange.to);
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [preFiltered, search, dept, dateRange]);

  function clearFilters() {
    setSearch(''); setDept('');
    const r = currentMonthRange();
    setDateRange({ preset: 'currentMonth', from: r.from, to: r.to, field: 'date' });
  }

  const IS = { padding: '7px 10px', borderRadius: 7, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 12, color: '#1a2535', background: 'white', outline: 'none', fontWeight: 600 };
  const TD = { padding: '9px 12px', verticalAlign: 'middle', fontSize: 12 };
  const TH = { background: '#f3f7fc', padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#6b7a90', letterSpacing: 0.7, textTransform: 'uppercase', borderBottom: '1px solid #d8e2ef', whiteSpace: 'nowrap' };

  // Per-column cell renderer for issues.
  function renderCell(col, i) {
    switch (col) {
      case 'Date':
        return <td style={{ ...TD, fontSize: 11, color: '#6b7a90', whiteSpace: 'nowrap' }}>{fDate(i.date)}</td>;
      case 'Issue':
        return (
          <td style={{ ...TD, fontWeight: 700, maxWidth: 280 }}>
            {i.title}
            {i.desc && <div style={{ fontSize: 10.5, color: '#6b7a90', fontWeight: 500, marginTop: 2 }}>{i.desc.length > 60 ? i.desc.slice(0, 60) + '…' : i.desc}</div>}
          </td>
        );
      case 'Reporter':
        return <td style={{ ...TD, fontSize: 11 }}>{i.reporter || '—'}</td>;
      case 'Resolved By':
        return <td style={{ ...TD, fontSize: 11 }}>{i.resolveBy || '—'}</td>;
      case 'Status':
        return <td style={TD}><StatusBadge status={i.status} /></td>;
      case 'Priority':
        return <td style={TD}><PriorityBadge priority={i.priority} /></td>;
      case 'Action':
        return (
          <td style={TD}>
            <button
              onClick={() => setExpandedId(expandedId === i.id ? null : i.id)}
              style={{
                padding: '4px 12px', borderRadius: 6,
                background: expandedId === i.id ? '#334155' : '#0d7377',
                color: 'white', border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 800,
              }}
            >
              {expandedId === i.id ? '✕ Close' : '👁 View'}
            </button>
          </td>
        );
      default:
        return <td style={TD}>—</td>;
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-2xl">
      {/* Filter row — Status and Priority dropdowns removed: preFilter scopes rows. */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 SEARCH ISSUE…" style={{ ...IS, flex: 1, minWidth: 160 }} />
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

      {/* Table — columns come from the per-card `columns` prop. Clicking
          a row's View button toggles an inline detail panel directly below
          the row. The detail lives INSIDE the tbody's scrollable area so
          it can't get cropped behind the modal header. */}
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
            {rows.length ? rows.map((i) => {
              const isExpanded = expandedId === i.id;
              return (
                <FragmentRow
                  key={i.id}
                  issue={i}
                  columns={columns}
                  renderCell={renderCell}
                  isExpanded={isExpanded}
                  expandedNode={isExpanded ? (
                    <InlineIssueDetail
                      issue={i}
                      onOpenManage={() => { onClose(); navigate('/all-issues?focus=' + encodeURIComponent(i.id)); }}
                      onCollapse={() => setExpandedId(null)}
                    />
                  ) : null}
                />
              );
            }) : (
              <tr><td colSpan={columns.length} style={{ padding: 28, textAlign: 'center', color: '#6b7a90', fontSize: 12.5 }}>No issues match the selected filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

// Fragment wrapper so each issue row + its optional inline expansion render
// as siblings under the same key inside tbody.
function FragmentRow({ issue, columns, renderCell, isExpanded, expandedNode }) {
  return (
    <>
      <tr style={{ background: 'white', borderBottom: '1px solid #f3f7fc' }}>
        {columns.map((col) => renderCell(col, issue))}
      </tr>
      {isExpanded && expandedNode}
    </>
  );
}

// Inline detail panel for an issue, rendered inside the table tbody.
function InlineIssueDetail({ issue, onOpenManage, onCollapse }) {
  const i = issue;
  return (
    <tr style={{ background: '#f0f7fb' }}>
      <td colSpan={99} style={{ padding: '14px 18px', borderBottom: '2px solid #d8e2ef' }}>
        <Panel title="📋 Issue Details">
          <DetailRow label="Title"><strong>{i.title || '—'}</strong></DetailRow>
          <DetailRow label="Department"><DeptTag name={i.dept} /></DetailRow>
          <DetailRow label="Priority"><PriorityBadge priority={i.priority} /></DetailRow>
          <DetailRow label="Status"><StatusBadge status={i.status} /></DetailRow>
          <DetailRow label="Reported By"><strong>{i.reporter || '—'}</strong></DetailRow>
          <DetailRow label="Reported Date"><span style={{ color: '#0d7377', fontWeight: 800 }}>{i.date ? fDate(i.date) : '—'}</span></DetailRow>
          {i.assigned && <DetailRow label="Assigned To"><strong>{i.assigned}</strong></DetailRow>}
        </Panel>

        {i.desc && (
          <Panel title="📝 Description">
            <div style={{ fontSize: 13, color: '#1a2535', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{i.desc}</div>
          </Panel>
        )}

        {i.status === 'resolved' && (
          <Panel title="✅ Resolution">
            <DetailRow label="Resolved By"><strong>{i.resolveBy || '—'}</strong></DetailRow>
            <DetailRow label="Resolved At"><span style={{ color: '#0d7377', fontWeight: 800 }}>{i.resolvedAt ? fDate(String(i.resolvedAt).slice(0, 10)) : '—'}</span></DetailRow>
            {i.resolveRemark && <DetailRow label="Remark"><span style={{ color: '#6b7a90' }}>{i.resolveRemark}</span></DetailRow>}
          </Panel>
        )}

        {i.status === 'escalated' && (
          <Panel title="🚨 Escalation">
            {i.escalatedTo && <DetailRow label="Escalated To"><strong>{i.escalatedTo}</strong></DetailRow>}
            {i.escalatedAt && <DetailRow label="Escalated At"><span style={{ color: '#0d7377', fontWeight: 800 }}>{fDate(String(i.escalatedAt).slice(0, 10))}</span></DetailRow>}
            {i.escalationReason && <DetailRow label="Reason"><span style={{ color: '#6b7a90' }}>{i.escalationReason}</span></DetailRow>}
          </Panel>
        )}

        {/* Action row */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button
            onClick={onOpenManage}
            style={{
              padding: '9px 16px', borderRadius: 8,
              background: '#0d7377', color: 'white',
              border: 'none', cursor: 'pointer',
              fontWeight: 800, fontSize: 12.5,
            }}
          >
            📋 Open in Issues →
          </button>
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
            💡 For Resolve / Escalate actions, open in Issues page.
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