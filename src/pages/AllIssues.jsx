import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { fDate, exportToExcel } from '../utils';
import { DeptTag, PriorityBadge, StatusBadge } from '../components/common/Badge';
import { EmptyState } from '../components/common/Alert';
import { FilterPopup, FilterField, FP_INPUT, ChipButton } from '../components/common/FilterPopup';

export default function AllIssues() {
  const { issues } = useApp();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  // ?focus=<issueId> — set by the dashboard drilldown's "Open in Issues"
  // button. On mount, scroll the matching card into view and highlight it
  // briefly so the user lands on it. The card itself may be filtered out
  // by the current search/status/priority filter (we clear the filter
  // chips so the focused card is visible), and we strip the param so a
  // refresh doesn't re-trigger the scroll.
  const [searchParams, setSearchParams] = useSearchParams();
  const [highlightId, setHighlightId] = useState(null);
  const focusId = searchParams.get('focus');
  useEffect(() => {
    if (!focusId) return;
    // Clear any active filters so the focused issue is visible regardless
    // of what the user was looking at before navigating.
    setSearch(''); setFilterStatus(''); setFilterPriority('');
    setHighlightId(focusId);
    requestAnimationFrame(() => {
      const el = document.getElementById(`issue-card-${focusId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    setSearchParams((prev) => { prev.delete('focus'); return prev; }, { replace: true });
    const t = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  const filtered = [...issues].filter((i) => {
    if (search && !i.title.toUpperCase().includes(search.toUpperCase())) return false;
    if (filterStatus && i.status !== filterStatus) return false;
    if (filterPriority && i.priority !== filterPriority) return false;
    return true;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  const activeCount = (search ? 1 : 0) + (filterStatus ? 1 : 0) + (filterPriority ? 1 : 0);
  const clearAll = () => { setSearch(''); setFilterStatus(''); setFilterPriority(''); };

  return (
    <div>
      <div className="page-header">
        <h2 className="page-header-title" style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>All Issues</h2>
        <div className="page-header-actions">
          <button onClick={() => exportToExcel(filtered.map(i => ({ Title: i.title, Department: i.dept, Priority: i.priority, Reporter: i.reporter, Assigned: i.assigned, Status: i.status, Date: i.date })), 'all-issues')} style={{ padding: '9px 18px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>⬇ Export</button>
          <button onClick={() => window.print()} style={{ padding: '9px 18px', borderRadius: 8, background: '#334155', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>🖨 Print</button>
        </div>
      </div>
      {/* Filter popup — search + status + priority. Status / priority use
          chip rows so they're tappable on touch and feel like radio groups. */}
      <FilterPopup activeCount={activeCount} onClear={clearAll}>
        <FilterField label="Search">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="SEARCH ISSUE TITLE..." style={FP_INPUT} autoFocus />
        </FilterField>
        <FilterField label="Status">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <ChipButton active={!filterStatus} onClick={() => setFilterStatus('')}>ALL</ChipButton>
            <ChipButton active={filterStatus === 'open'} onClick={() => setFilterStatus('open')}>OPEN</ChipButton>
            <ChipButton active={filterStatus === 'in-progress'} onClick={() => setFilterStatus('in-progress')}>IN PROGRESS</ChipButton>
            <ChipButton active={filterStatus === 'resolved'} onClick={() => setFilterStatus('resolved')}>RESOLVED</ChipButton>
          </div>
        </FilterField>
        <FilterField label="Priority">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <ChipButton active={!filterPriority} onClick={() => setFilterPriority('')}>ALL</ChipButton>
            <ChipButton active={filterPriority === 'high'} onClick={() => setFilterPriority('high')}>HIGH</ChipButton>
            <ChipButton active={filterPriority === 'medium'} onClick={() => setFilterPriority('medium')}>MEDIUM</ChipButton>
            <ChipButton active={filterPriority === 'low'} onClick={() => setFilterPriority('low')}>LOW</ChipButton>
          </div>
        </FilterField>
      </FilterPopup>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length ? filtered.map((i) => (
          <div
            key={i.id}
            id={`issue-card-${i.id}`}
            style={{
              background: i.id === highlightId ? '#fff7d6' : 'white',
              borderRadius: 11, border: `1px solid ${i.id === highlightId ? '#fbbf24' : '#d8e2ef'}`,
              padding: '14px 16px',
              borderLeft: `4px solid ${i.priority === 'high' ? '#c0392b' : i.priority === 'low' ? '#1a7a4a' : '#d4920a'}`,
              transition: 'background 0.6s, border-color 0.6s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <strong style={{ fontSize: 14 }}>{i.title}</strong>
              <div style={{ display: 'flex', gap: 5 }}><PriorityBadge priority={i.priority} /><StatusBadge status={i.status} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: '#6b7a90' }}>
              <DeptTag name={i.dept} />
              <span>By: {i.reporter || '—'}</span>
              <span>📅 {fDate(i.date)}</span>
              {i.assigned && <span>Assigned: {i.assigned}</span>}
            </div>
            {i.resolveRemark && <div style={{ marginTop: 8, background: '#d4edda', padding: '6px 10px', borderRadius: 7, fontSize: 11, color: '#1a7a4a' }}>✅ {i.resolveRemark} — By {i.resolveBy}</div>}
          </div>
        )) : <EmptyState icon="✅" message="NO ISSUES FOUND" />}
      </div>
    </div>
  );
}
