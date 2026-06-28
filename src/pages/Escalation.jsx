import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { fDate, exportToExcel, isEscalatedIssue } from '../utils';
import { DeptTag, PriorityBadge, StatusBadge } from '../components/common/Badge';
import { EmptyState, Alert } from '../components/common/Alert';
import { FilterPopup, FilterField, FP_INPUT } from '../components/common/FilterPopup';

export default function Escalation() {
  const { issues } = useApp();
  const [filterDept, setFilterDept] = useState('');

  // Use the shared helper so this page, the dashboard card, the sidebar
  // badge and the drill-down modal all agree on what "escalated" means.
  const escalated = issues.filter((i) => isEscalatedIssue(i) && (!filterDept || i.dept === filterDept));
  const allDepts = [...new Set(issues.map((i) => i.dept).filter(Boolean))];
  const activeCount = filterDept ? 1 : 0;
  const clearAll = () => setFilterDept('');

  return (
    <div>
      <div className="page-header">
        <h2 className="page-header-title" style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>🔺 Escalation Tracker</h2>
        <div className="page-header-actions">
          <button onClick={() => exportToExcel(escalated.map(i => ({ Title: i.title, Department: i.dept, Priority: i.priority, Reporter: i.reporter, Assigned: i.assigned, Status: i.status, Date: i.date })), 'escalation-export')} style={{ padding: '9px 18px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>⬇ Export</button>
          <button onClick={() => window.print()} style={{ padding: '9px 18px', borderRadius: 8, background: '#334155', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>🖨 Print</button>
        </div>
      </div>

      {/* Filter popup — only Department on this page (the only filter that
          matters for escalation triage). Uses the shared FilterPopup so
          this page matches the rest of the app's filter UX. */}
      <FilterPopup activeCount={activeCount} onClear={clearAll}>
        <FilterField label="Department">
          <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} style={FP_INPUT}>
            <option value="">ALL DEPTS</option>
            {allDepts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </FilterField>
      </FilterPopup>

      {escalated.length > 0 && (
        <Alert variant="red">🚨 {escalated.length} HIGH PRIORITY open issue(s) need attention!</Alert>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
        {escalated.length ? escalated.map((i) => (
          <div key={i.id} style={{ background: 'white', borderRadius: 12, border: '1.5px solid #fca5a5', padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,#c0392b,#ff6b6b)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              <strong style={{ fontSize: 15 }}>🚨 {i.title}</strong>
              <StatusBadge status={i.status} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: '#6b7a90' }}>
              <DeptTag name={i.dept} />
              <PriorityBadge priority={i.priority} />
              <span>By: {i.reporter || '—'}</span>
              <span>📅 {fDate(i.date)}</span>
              {i.assigned && <span>Assigned: {i.assigned}</span>}
            </div>
            {i.desc && <div style={{ marginTop: 8, fontSize: 12, color: '#1a2535', background: '#fde8e8', padding: '7px 11px', borderRadius: 8 }}>{i.desc}</div>}
          </div>
        )) : <EmptyState icon="🎉" message="NO ESCALATIONS — ALL CLEAR!" />}
      </div>
    </div>
  );
}
