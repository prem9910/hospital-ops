import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { fDate, exportToExcel } from '../utils';
import { DeptTag, PriorityBadge, StatusBadge } from '../components/common/Badge';
import { EmptyState } from '../components/common/Alert';

const IS = { padding: '8px 12px', borderRadius: 7, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 12.5, color: '#1a2535', outline: 'none', background: 'white', fontWeight: 600 };

export default function AllIssues() {
  const { issues } = useApp();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  const filtered = [...issues].filter((i) => {
    if (search && !i.title.toUpperCase().includes(search.toUpperCase())) return false;
    if (filterStatus && i.status !== filterStatus) return false;
    if (filterPriority && i.priority !== filterPriority) return false;
    return true;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div>
      <div className="page-header">
        <h2 className="page-header-title" style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>All Issues</h2>
        <div className="page-header-actions">
          <button onClick={() => exportToExcel(filtered.map(i => ({ Title: i.title, Department: i.dept, Priority: i.priority, Reporter: i.reporter, Assigned: i.assigned, Status: i.status, Date: i.date })), 'all-issues')} style={{ padding: '7px 14px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>⬇ Export</button>
          <button onClick={() => window.print()} style={{ padding: '7px 14px', borderRadius: 8, background: '#334155', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>🖨 Print</button>
        </div>
      </div>
      <div className="filter-bar">
        <input className="filter-bar-input filter-bar-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 SEARCH..." style={IS} />
        <select className="filter-bar-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={IS}>
          <option value="">ALL STATUS</option>
          <option value="open">OPEN</option>
          <option value="in-progress">IN PROGRESS</option>
          <option value="resolved">RESOLVED</option>
        </select>
        <select className="filter-bar-select" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} style={IS}>
          <option value="">ALL PRIORITY</option>
          <option value="high">HIGH</option>
          <option value="medium">MEDIUM</option>
          <option value="low">LOW</option>
        </select>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length ? filtered.map((i) => (
          <div key={i.id} style={{ background: 'white', borderRadius: 11, border: '1px solid #d8e2ef', padding: '14px 16px', borderLeft: `4px solid ${i.priority === 'high' ? '#c0392b' : i.priority === 'low' ? '#1a7a4a' : '#d4920a'}` }}>
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
