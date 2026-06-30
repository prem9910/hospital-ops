import { useApp } from '../context/AppContext';
import { isTaskDueToday, wasCompletedLate } from '../utils';
import { DeptTag } from '../components/common/Badge';

export default function LiveTracking() {
  const { tasks, issues, depts, employees } = useApp();

  const todayTasks = tasks.filter((t) => isTaskDueToday(t) || t.status === 'pending');
  const deptData = depts.map((d) => {
    const dTasks = todayTasks.filter((t) => t.dept === d.name);
    const done = dTasks.filter((t) => t.status === 'done').length;
    const pend = dTasks.filter((t) => t.status === 'pending').length;
    const delayed = dTasks.filter((t) => t.status === 'done' && wasCompletedLate(t)).length;
    const openIss = issues.filter((i) => i.dept === d.name && i.status !== 'resolved').length;
    const staff = employees.filter((e) => e.dept === d.name).length;
    const pct = dTasks.length ? Math.round(done / dTasks.length * 100) : 100;
    const isAlert = pend > 0 && openIss > 0;
    return { ...d, total: dTasks.length, done, pend, delayed, openIss, staff, pct, isAlert };
  }).sort((a, b) => a.pct - b.pct);

  const totalDue = todayTasks.length;
  const totalDone = todayTasks.filter((t) => t.status === 'done').length;
  const totalPct = totalDue ? Math.round(totalDone / totalDue * 100) : 100;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>📈 Live Tracking Dashboard</h2>
        <div style={{ background: 'white', border: '1px solid #d8e2ef', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700 }}>
          🏥 Live: <span style={{ color: totalPct === 100 ? '#1a7a4a' : totalPct > 60 ? '#0d7377' : '#d4920a', fontFamily: "'Playfair Display',serif", fontSize: 18 }}>{totalPct}%</span>
        </div>
      </div>

      {/* Overall bar */}
      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, fontWeight: 700 }}>
          <span>Today's Overall Progress</span>
          <span>{totalDone}/{totalDue} tasks</span>
        </div>
        <div style={{ height: 10, background: '#e4eaf2', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${totalPct}%`, background: totalPct === 100 ? '#1a7a4a' : totalPct > 60 ? '#0d7377' : '#d4920a', borderRadius: 10, transition: 'width 0.4s' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
        {deptData.map((d) => (
          <div key={d.id} style={{ background: 'white', borderRadius: 13, border: `1px solid ${d.isAlert ? '#fca5a5' : '#d8e2ef'}`, padding: 18, position: 'relative', overflow: 'hidden', transition: 'box-shadow 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)'}
            onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}>
            {d.isAlert && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,#c0392b,#ff6b6b)' }} />}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <DeptTag name={d.name} />
              <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 28, color: d.pct === 100 ? '#1a7a4a' : d.pct > 60 ? '#0d7377' : '#d4920a', lineHeight: 1 }}>{d.pct}%</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
              {[
                ['✅ Done', d.done, '#1a7a4a'],
                ['⏳ Pending', d.pend, d.pend > 0 ? '#c0392b' : '#6b7a90'],
                ['⏰ Delayed', d.delayed, d.delayed > 0 ? '#6d28d9' : '#6b7a90'],
                ['⚠️ Issues', d.openIss, d.openIss > 0 ? '#c0392b' : '#6b7a90'],
              ].map(([label, val, color]) => (
                <div key={label} style={{ background: '#f3f7fc', borderRadius: 8, padding: '7px 10px' }}>
                  <div style={{ fontSize: 10, color: '#6b7a90', fontWeight: 700 }}>{label}</div>
                  <div style={{ fontSize: 18, fontFamily: "'Playfair Display',serif", color }}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{ height: 6, background: '#e4eaf2', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${d.pct}%`, background: d.pct === 100 ? '#1a7a4a' : d.pct > 60 ? '#0d7377' : d.pct > 30 ? '#d4920a' : '#c0392b', borderRadius: 10, transition: 'width 0.4s' }} />
            </div>
            <div style={{ fontSize: 11, color: '#6b7a90', marginTop: 6 }}>👥 {d.staff} staff · {d.total} tasks today</div>
          </div>
        ))}
      </div>
    </div>
  );
}
