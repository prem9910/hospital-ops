import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { wasCompletedLate, isTaskDueToday, isAssignedTo, fDate } from '../utils';
import { DeptTag, PriorityBadge } from '../components/common/Badge';

// ─── Charts ──────────────────────────────────────────────────────────────────
function DonutChart({ data, size = 130, centerLabel, centerSub }) {
  const R = 36;
  const circ = 2 * Math.PI * R;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#e4eaf2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 10, color: '#6b7a90' }}>No data</span>
    </div>
  );
  let cum = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 100 100" width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="50" cy="50" r={R} fill="none" stroke="#e4eaf2" strokeWidth="14" />
        {data.map((d, i) => {
          if (!d.value) return null;
          const len = (d.value / total) * circ;
          const offset = circ - (cum / total) * circ;
          cum += d.value;
          return <circle key={i} cx="50" cy="50" r={R} fill="none" stroke={d.color} strokeWidth="14" strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={offset} />;
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {centerLabel && <div style={{ fontFamily: "'Playfair Display',serif", fontSize: size > 110 ? 20 : 14, fontWeight: 900, color: '#0b1e3d', lineHeight: 1 }}>{centerLabel}</div>}
        {centerSub && <div style={{ fontSize: 8.5, color: '#6b7a90', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{centerSub}</div>}
      </div>
    </div>
  );
}

function MiniBar({ label, value, max, color }) {
  const pct = max ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1a2535', maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color }}>{value}%</span>
      </div>
      <div style={{ height: 6, background: '#e4eaf2', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 10 }} />
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ num, label, color, onClick }) {
  const colors = { green: '#1a7a4a', red: '#c0392b', gold: '#d4920a', teal: '#0d7377', blue: '#1a56db', purple: '#6d28d9', orange: '#c05a00' };
  return (
    <div
      onClick={onClick}
      style={{ background: 'white', borderRadius: 12, padding: '16px', border: '1px solid #d8e2ef', position: 'relative', overflow: 'hidden', cursor: onClick ? 'pointer' : 'default', transition: 'transform 0.2s,box-shadow 0.2s' }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: colors[color] || colors.teal }} />
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 34, color: '#1a2535', lineHeight: 1 }}>{num}</div>
      <div style={{ fontSize: 11, color: '#6b7a90', marginTop: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
    </div>
  );
}

function DeptCard({ dept, stats, onClick }) {
  const p = stats.tot ? Math.round(stats.dn / stats.tot * 100) : 100;
  const c = (p === 100 && !stats.dl) ? '#1a7a4a' : p > 60 ? '#0d7377' : '#d4920a';
  return (
    <div onClick={onClick} style={{ background: 'white', borderRadius: 11, border: '1px solid #d8e2ef', padding: 14, cursor: 'pointer', transition: 'transform 0.2s,box-shadow 0.2s' }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}><DeptTag name={dept} /></div>
      <div style={{ fontSize: 11, color: '#6b7a90', marginBottom: 4 }}>
        {stats.dn}/{stats.tot} done {stats.iss > 0 && <span style={{ color: '#c0392b' }}>• ⚠️ {stats.iss}</span>}
      </div>
      {stats.dl > 0 && <div style={{ fontSize: 10.5, color: '#6d28d9', fontWeight: 800, marginBottom: 2 }}>⏰ {stats.dl} delayed</div>}
      <div style={{ height: 6, background: '#e4eaf2', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${p}%`, background: c, borderRadius: 10 }} />
      </div>
      <div style={{ fontSize: 10, color: '#6b7a90', marginTop: 3, textAlign: 'right' }}>{p}%</div>
    </div>
  );
}

function scoreColor(s) { return s >= 80 ? '#1a7a4a' : s >= 60 ? '#0d7377' : s >= 40 ? '#d4920a' : '#c0392b'; }

export default function Dashboard() {
  const { currentRole, currentUser } = useAuth();
  const { tasks, issues, employees, depts, delegations } = useApp();
  // Only mainadmin sees the full system dashboard; admin employees see their own
  if (currentRole !== 'mainadmin') return <StaffDashboard />;

  // Stats
  const done = tasks.filter((t) => t.status === 'done').length;
  const pend = tasks.filter((t) => t.status === 'pending').length;
  const delay = tasks.filter((t) => t.status === 'done' && wasCompletedLate(t)).length;
  const onTime = tasks.filter((t) => t.status === 'done' && !wasCompletedLate(t)).length;
  const openI = issues.filter((i) => i.status !== 'resolved').length;
  const resI = issues.filter((i) => i.status === 'resolved').length;
  const esc = issues.filter((i) => i.priority === 'high' && i.status === 'open').length;
  const total = tasks.length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const issComp = (openI + resI) > 0 ? Math.round(resI / (openI + resI) * 100) : 100;

  // Delegation stats
  const delegTasks = tasks.filter((t) => t.freq === 'delegation');
  const delegDone = delegTasks.filter((t) => t.status === 'done').length;
  const delegPend = delegTasks.filter((t) => t.status === 'pending').length;

  // Employee performance scores
  const empScores = employees.map((e) => {
    const mine = tasks.filter((t) => isAssignedTo(t, e.name));
    const comp = mine.filter((t) => t.status === 'done');
    const late = comp.filter((t) => wasCompletedLate(t)).length;
    const base = mine.length > 0 ? (comp.length / mine.length) * 100 : 100;
    const score = Math.max(0, Math.round(base - late * 10));
    return { name: e.name, score };
  }).sort((a, b) => b.score - a.score).slice(0, 6);

  // Dept stats
  const deptStats = {};
  tasks.forEach((t) => {
    if (!deptStats[t.dept]) deptStats[t.dept] = { tot: 0, dn: 0, dl: 0, pend: 0, iss: 0 };
    deptStats[t.dept].tot++;
    if (t.status === 'done') deptStats[t.dept].dn++;
    if (t.status === 'pending') deptStats[t.dept].pend++;
    if (wasCompletedLate(t)) deptStats[t.dept].dl++;
  });
  issues.filter((i) => i.status !== 'resolved').forEach((i) => {
    if (!deptStats[i.dept]) deptStats[i.dept] = { tot: 0, dn: 0, dl: 0, pend: 0, iss: 0 };
    deptStats[i.dept].iss++;
  });

  const hiPending = tasks.filter((t) => t.status === 'pending' && t.priority === 'high');

  return (
    <div>
      {/* Greeting */}
      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 22 }}>👋</span>
        <div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>Welcome back, {currentUser.name}</div>
          <div style={{ fontSize: 12, color: '#6b7a90' }}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="resp-grid-4">
        <StatCard num={done} label="Completed" color="green" />
        <StatCard num={onTime} label="On Time" color="teal" />
        <StatCard num={delay} label="Delayed" color="purple" />
        <StatCard num={pend} label="Pending" color="red" />
        <StatCard num={openI} label="Open Issues" color="gold" />
        <StatCard num={esc} label="Escalated" color="red" />
        <StatCard num={employees.length} label="Total Staff" color="blue" />
        <StatCard num={`${issComp}%`} label="Issues Resolved" color="green" />
      </div>

      {/* Alerts */}
      {delay > 0 && (
        <div style={{ background: '#faf5ff', border: '1px solid #c4b5fd', borderLeft: '3px solid #6d28d9', padding: '10px 14px', borderRadius: 9, marginBottom: 11, fontSize: 12.5 }}>
          ⏰ <strong>{delay} task(s) DELAYED</strong>
        </div>
      )}
      {hiPending.map((t) => (
        <div key={t.id} style={{ background: '#fde8e8', borderLeft: '3px solid #c0392b', padding: '10px 14px', borderRadius: 9, marginBottom: 8, fontSize: 12.5, color: '#7d1a1a' }}>
          🚨 <strong>{t.name}</strong> — {t.dept} — 👤 {t.assignedTo?.join('/')} — 📅 {t.schedDate ? fDate(t.schedDate) : '—'}
        </div>
      ))}

      {/* ── Charts row ── */}
      <div className="resp-grid-3">
        {/* Task breakdown donut */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', padding: 18 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 13, color: '#0b1e3d', marginBottom: 14 }}>📊 Task Breakdown</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <DonutChart size={110} centerLabel={`${pct}%`} centerSub="Done" data={[
              { value: onTime, color: '#1a7a4a' },
              { value: delay, color: '#6d28d9' },
              { value: pend, color: '#d4920a' },
            ]} />
            <div style={{ flex: 1 }}>
              {[
                { color: '#1a7a4a', label: 'On Time', val: onTime },
                { color: '#6d28d9', label: 'Delayed', val: delay },
                { color: '#d4920a', label: 'Pending', val: pend },
              ].map(({ color, label, val }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, marginBottom: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ flex: 1, color: '#6b7a90' }}>{label}</span>
                  <strong style={{ color }}>{val}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Issue breakdown donut */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', padding: 18 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 13, color: '#0b1e3d', marginBottom: 14 }}>⚠️ Issue Status</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <DonutChart size={110} centerLabel={`${issComp}%`} centerSub="Resolved" data={[
              { value: resI, color: '#1a7a4a' },
              { value: openI - esc, color: '#d4920a' },
              { value: esc, color: '#c0392b' },
            ]} />
            <div style={{ flex: 1 }}>
              {[
                { color: '#1a7a4a', label: 'Resolved', val: resI },
                { color: '#d4920a', label: 'Open', val: openI - esc },
                { color: '#c0392b', label: 'Escalated', val: esc },
              ].map(({ color, label, val }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, marginBottom: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ flex: 1, color: '#6b7a90' }}>{label}</span>
                  <strong style={{ color }}>{val}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Delegation donut */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', padding: 18 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 13, color: '#0b1e3d', marginBottom: 14 }}>📤 Delegation Tasks</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <DonutChart size={110} centerLabel={`${delegTasks.length}`} centerSub="Total" data={[
              { value: delegDone, color: '#1a7a4a' },
              { value: delegPend, color: '#d4920a' },
            ]} />
            <div style={{ flex: 1 }}>
              {[
                { color: '#1a7a4a', label: 'Completed', val: delegDone },
                { color: '#d4920a', label: 'Pending', val: delegPend },
              ].map(({ color, label, val }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, marginBottom: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ flex: 1, color: '#6b7a90' }}>{label}</span>
                  <strong style={{ color }}>{val}</strong>
                </div>
              ))}
              <div style={{ marginTop: 10, fontSize: 10.5, color: '#6b7a90', borderTop: '1px solid #e4eaf2', paddingTop: 8 }}>
                🔄 Extensions: <strong style={{ color: '#6d28d9' }}>{delegTasks.reduce((s, t) => s + (t.extensions || []).length, 0)}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Employee Performance mini-chart ── */}
      {empScores.length > 0 && (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', padding: 18, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: '#0b1e3d' }}>👤 Employee Performance (Top {empScores.length})</div>
            <div style={{ fontSize: 11, color: '#6b7a90' }}>Score = Completion% − (Delayed × 10)</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' }}>
            {empScores.map((e) => (
              <MiniBar key={e.name} label={e.name} value={e.score} max={100} color={scoreColor(e.score)} />
            ))}
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {[['#1a7a4a', '≥80 Excellent'], ['#0d7377', '≥60 Good'], ['#d4920a', '≥40 Fair'], ['#c0392b', '<40 Poor']].map(([c, l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#6b7a90' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />{l}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Dept cards ── */}
      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', padding: 18 }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: '#0b1e3d', marginBottom: 12 }}>🏢 Department Progress</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
          {Object.entries(deptStats).map(([dept, s]) => (
            <DeptCard key={dept} dept={dept} stats={s} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StaffDashboard() {
  const { currentUser } = useAuth();
  const { tasks, issues, delegations } = useApp();

  // Build taskMap for grandchild detection
  const taskMap = {};
  tasks.forEach(t => { taskMap[t.id] = t; });
  const isGC = (t) => !!(t.parentTaskId && taskMap[t.parentTaskId]?.parentTaskId);

  const myTasksBase = tasks.filter((t) => {
    if (!isAssignedTo(t, currentUser.name)) return false;
    if (isGC(t)) return false;
    // Show task if it's due today (freq logic) OR if schedDate is today/past (overdue)
    if (isTaskDueToday(t)) return true;
    if (t.schedDate && t.schedDate <= new Date().toISOString().slice(0, 10)) return true;
    return false;
  });
  // Deduplicate: if pending child exists, hide parent
  const myTasks = myTasksBase.filter((t) =>
    !(t.status === 'pending' && tasks.some(x => x.parentTaskId === t.id && x.status === 'pending' && isAssignedTo(x, currentUser.name)))
  );
  const myPending = myTasks.filter((t) => t.status === 'pending');
  const myDone = myTasks.filter((t) => t.status === 'done');
  const myDelayed = myTasks.filter((t) => wasCompletedLate(t));
  const myDels = delegations.filter((d) => d.doerName === currentUser.name && (d.status === 'pending' || d.status === 'accepted'));
  const allDone = tasks.filter((t) => isAssignedTo(t, currentUser.name) && t.status === 'done' && !isGC(t));
  const allMine = tasks.filter((t) => isAssignedTo(t, currentUser.name) && !isGC(t));
  const myDelayAll = allDone.filter((t) => wasCompletedLate(t)).length;
  const myScore = allMine.length > 0 ? Math.max(0, Math.round((allDone.length / allMine.length) * 100 - myDelayAll * 10)) : 100;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>👋 Welcome, {currentUser.name}</div>
          <div style={{ fontSize: 12, color: '#6b7a90' }}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long' })}</div>
        </div>
        <button onClick={() => window.print()} style={{ padding: '7px 14px', borderRadius: 8, background: '#334155', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>🖨 Print</button>
      </div>
      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 14, marginBottom: 18 }}>
        <StatCard num={myPending.length} label="My Pending" color="red" />
        <StatCard num={myDone.length} label="Done Today" color="green" />
        <StatCard num={myDelayed.length} label="Delayed" color="purple" />
        <StatCard num={myDels.length} label="My Delegations" color="blue" />
        <StatCard num={allDone.length} label="Total Completed" color="green" />
      </div>

      {/* Charts */}
      <div className="resp-grid-2" style={{ marginBottom: 18 }}>
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', padding: 18 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 13, color: '#0b1e3d', marginBottom: 14 }}>📊 My Performance Score</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <DonutChart size={110} centerLabel={`${myScore}`} centerSub="Score" data={[
              { value: myScore, color: scoreColor(myScore) },
              { value: Math.max(0, 100 - myScore), color: '#e4eaf2' },
            ]} />
            <div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 32, color: scoreColor(myScore), lineHeight: 1 }}>{myScore}</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: scoreColor(myScore), marginBottom: 10 }}>{myScore >= 80 ? '🟢 Excellent' : myScore >= 60 ? '🔵 Good' : myScore >= 40 ? '🟡 Fair' : '🔴 Needs Improvement'}</div>
              <div style={{ fontSize: 11, color: '#6b7a90' }}>All time: {allDone.length}/{allMine.length} done</div>
              <div style={{ fontSize: 11, color: '#c0392b' }}>Delayed: {myDelayAll} (−{myDelayAll * 10} pts)</div>
            </div>
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', padding: 18 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 13, color: '#0b1e3d', marginBottom: 14 }}>📤 Today's Task Status</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <DonutChart size={110} centerLabel={`${myTasks.length}`} centerSub="Today" data={[
              { value: myDone.length, color: '#1a7a4a' },
              { value: myPending.length, color: '#d4920a' },
            ]} />
            <div>
              {[
                { color: '#1a7a4a', label: 'Done', val: myDone.length },
                { color: '#d4920a', label: 'Pending', val: myPending.length },
              ].map(({ color, label, val }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
                  <span style={{ flex: 1, color: '#6b7a90' }}>{label}</span>
                  <strong style={{ color }}>{val}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* My Pending Tasks list */}
      {myPending.length > 0 && (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', padding: 18, marginBottom: 18 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: '#0b1e3d', marginBottom: 12 }}>⏳ My Pending Tasks</div>
          {myPending.map((t) => (
            <div key={t.id} style={{ background: '#f8fbff', border: '1px solid #d8e2ef', borderLeft: `4px solid ${t.priority === 'high' ? '#c0392b' : t.priority === 'low' ? '#1a7a4a' : '#d4920a'}`, borderRadius: 9, padding: '12px 14px', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
              <div style={{ fontSize: 11, color: '#6b7a90', marginTop: 4 }}>
                <DeptTag name={t.dept} /> &nbsp; <PriorityBadge priority={t.priority} />
                {t.schedDate && <span style={{ marginLeft: 6 }}>📅 {fDate(t.schedDate)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* My Active Delegations list */}
      {myDels.length > 0 && (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', padding: 18 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: '#0b1e3d', marginBottom: 12 }}>📤 My Active Delegations</div>
          {myDels.map((d) => (
            <div key={d.id} style={{ background: '#f8fbff', border: '1px solid #d8e2ef', borderLeft: '4px solid #0d7377', borderRadius: 9, padding: '12px 14px', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{d.task}</div>
              <div style={{ fontSize: 11, color: '#6b7a90', marginTop: 4 }}>
                🏢 {d.dept || '—'} &nbsp;|&nbsp; 📅 Due: {fDate(d.dueDate)} &nbsp;|&nbsp; By: {d.createdBy}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
