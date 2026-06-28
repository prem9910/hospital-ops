import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { isTaskDueToday, wasCompletedLate, fDate, exportToExcel } from '../utils';
import { FREQ_LABELS } from '../constants';
import { DeptTag, FreqBadge } from '../components/common/Badge';
import { EmptyState } from '../components/common/Alert';
import { FilterPopup, FilterField, FP_INPUT, ChipButton } from '../components/common/FilterPopup';

export default function Checklists() {
  const { tasks, depts } = useApp();
  const [filterDept, setFilterDept] = useState('');
  const [filterFreq, setFilterFreq] = useState('');

  const todayTasks = tasks.filter((t) => isTaskDueToday(t) || t.status === 'pending');
  const filtered = todayTasks.filter((t) => {
    if (filterDept && t.dept !== filterDept) return false;
    if (filterFreq && t.freq !== filterFreq) return false;
    return true;
  });

  const byDept = {};
  filtered.forEach((t) => {
    const key = t.dept || 'UNCATEGORIZED';
    if (!byDept[key]) byDept[key] = [];
    byDept[key].push(t);
  });

  const totalDue = filtered.length;
  const totalDone = filtered.filter((t) => t.status === 'done').length;
  const pct = totalDue ? Math.round(totalDone / totalDue * 100) : 100;

  const activeCount = (filterDept ? 1 : 0) + (filterFreq ? 1 : 0);
  const clearAll = () => { setFilterDept(''); setFilterFreq(''); };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>Department Checklists</h2>
            <span style={{ background: '#ef4444', color: 'white', borderRadius: 20, fontSize: 11, fontWeight: 800, padding: '2px 10px', minWidth: 24, textAlign: 'center' }}>{totalDue}</span>
          </div>
          <div style={{ fontSize: 12, color: '#6b7a90', marginTop: 3 }}>{totalDone}/{totalDue} tasks completed — {pct}%</div>
        </div>
        <div className="page-header-actions">
          <button onClick={() => exportToExcel(filtered.map(t => ({ Task: t.name, Department: t.dept, Frequency: t.freq, Status: t.status, 'Assigned To': (t.assignedTo || []).join(', '), 'Done By': t.doneBy, Delayed: t.isDelayed ? 'YES' : 'NO' })), 'checklist-export')} style={{ padding: '9px 18px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>⬇ Export</button>
          <button onClick={() => window.print()} style={{ padding: '9px 18px', borderRadius: 8, background: '#334155', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>🖨 Print</button>
        </div>
      </div>

      {/* Filter popup — dept + frequency for the today's checklist view.
          Frequency uses chip row because there are only ~4 values, more
          tappable than a select. */}
      <FilterPopup activeCount={activeCount} onClear={clearAll}>
        <FilterField label="Department">
          <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} style={FP_INPUT}>
            <option value="">ALL DEPTS</option>
            {depts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
        </FilterField>
        <FilterField label="Frequency">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <ChipButton active={!filterFreq} onClick={() => setFilterFreq('')}>ALL</ChipButton>
            {Object.entries(FREQ_LABELS).map(([v, l]) => (
              <ChipButton key={v} active={filterFreq === v} onClick={() => setFilterFreq(v)}>{l}</ChipButton>
            ))}
          </div>
        </FilterField>
      </FilterPopup>

      {/* Overall progress */}
      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', padding: 16, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
          <span style={{ fontWeight: 700 }}>Overall Progress</span>
          <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: pct === 100 ? '#1a7a4a' : '#0d7377' }}>{pct}%</span>
        </div>
        <div style={{ height: 8, background: '#e4eaf2', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#1a7a4a' : pct > 60 ? '#0d7377' : '#d4920a', borderRadius: 10, transition: 'width 0.4s' }} />
        </div>
      </div>

      {Object.keys(byDept).length ? Object.entries(byDept).map(([dept, dTasks]) => {
        const done = dTasks.filter((t) => t.status === 'done').length;
        const dPct = dTasks.length ? Math.round(done / dTasks.length * 100) : 100;
        return (
          <div key={dept} style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ padding: '13px 16px', background: '#f3f7fc', borderBottom: '1px solid #d8e2ef', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <DeptTag name={dept} />
                <span style={{ fontSize: 12, color: '#6b7a90', fontWeight: 600 }}>{done}/{dTasks.length} done</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 80, height: 5, background: '#d8e2ef', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${dPct}%`, background: dPct === 100 ? '#1a7a4a' : dPct > 60 ? '#0d7377' : '#d4920a', borderRadius: 10 }} />
                </div>
                <span style={{ fontSize: 11, color: '#6b7a90', fontWeight: 700 }}>{dPct}%</span>
              </div>
            </div>
            {dTasks.map((t) => {
              const delayed = t.status === 'done' && wasCompletedLate(t);
              return (
                <div key={t.id} style={{ padding: '11px 16px', borderBottom: '1px solid #f0f4f8', display: 'flex', alignItems: 'center', gap: 10, background: t.status === 'done' ? '#f8fffe' : 'white' }}>
                  <span style={{ fontSize: 16 }}>{t.status === 'done' ? '✅' : '⏳'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: t.status === 'pending' ? 700 : 500, color: t.status === 'done' ? '#6b7a90' : '#1a2535', textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.name}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                      <FreqBadge freq={t.freq} />
                      {t.schedDate && <span style={{ fontSize: 10.5, color: '#6b7a90' }}>📅 {fDate(t.schedDate)}</span>}
                      {t.time && <span style={{ fontSize: 10.5, color: '#6b7a90' }}>⏰ {t.time}</span>}
                      {t.assignedTo?.length > 0 && <span style={{ fontSize: 10.5, color: '#6b7a90' }}>👤 {t.assignedTo.join(', ')}</span>}
                    </div>
                  </div>
                  {t.status === 'done' && (
                    <span style={{ fontSize: 10.5, color: delayed ? '#6d28d9' : '#1a7a4a', fontWeight: 700, background: delayed ? '#faf5ff' : '#d4edda', padding: '3px 9px', borderRadius: 20 }}>
                      {delayed ? '⏰ DELAYED' : '✅ ON TIME'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      }) : <EmptyState icon="📋" message="NO TASKS FOUND" />}
    </div>
  );
}
