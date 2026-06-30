import { useState, useMemo } from 'react';
import { Modal } from '../components/common/Modal';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { wasCompletedLate, fDate, toDay, exportToExcel, isAssignedTo, currentMonthRange, inDateRange } from '../utils';
import { DeptTag } from '../components/common/Badge';
import { DateRangePicker } from '../components/common/DateRangePicker';

// ─── Chart: SVG Donut ─────────────────────────────────────────────────────────
function DonutChart({ data, size = 140, centerLabel, centerSub }) {
  const R = 36;
  const circ = 2 * Math.PI * R;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#e4eaf2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 11, color: '#6b7a90' }}>No data</span>
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
        {centerLabel && <div style={{ fontFamily: "'Playfair Display',serif", fontSize: size > 120 ? 22 : 16, fontWeight: 900, color: '#0b1e3d', lineHeight: 1 }}>{centerLabel}</div>}
        {centerSub && <div style={{ fontSize: 9, color: '#6b7a90', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{centerSub}</div>}
      </div>
    </div>
  );
}

// ─── Chart: Horizontal Bars ───────────────────────────────────────────────────
function HBarChart({ data, maxVal }) {
  const max = maxVal || Math.max(...data.map(d => d.value), 1);
  return (
    <div>
      {data.map((d, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1a2535', maxWidth: '65%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: d.color || '#0d7377' }}>{d.display ?? d.value}</span>
          </div>
          <div style={{ height: 7, background: '#e4eaf2', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min((d.value / max) * 100, 100)}%`, background: d.color || '#0d7377', borderRadius: 10 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Chart: Grouped Bars ─────────────────────────────────────────────────────
function GroupedBar({ label, bars, maxVal }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#1a2535', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
      {bars.map((b, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
          <div style={{ fontSize: 9.5, color: '#6b7a90', width: 56, flexShrink: 0, textTransform: 'uppercase', letterSpacing: 0.3 }}>{b.label}</div>
          <div style={{ flex: 1, height: 6, background: '#e4eaf2', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min((b.value / maxVal) * 100, 100)}%`, background: b.color, borderRadius: 10 }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 800, color: b.color, minWidth: 20, textAlign: 'right' }}>{b.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function scoreColor(s) { return s >= 80 ? '#1a7a4a' : s >= 60 ? '#0d7377' : s >= 40 ? '#d4920a' : '#c0392b'; }
function scoreLabel(s) { return s >= 80 ? 'Excellent' : s >= 60 ? 'Good' : s >= 40 ? 'Fair' : 'Poor'; }
function scoreEmoji(s) { return s >= 80 ? '🟢' : s >= 60 ? '🔵' : s >= 40 ? '🟡' : '🔴'; }

function calcEmpStats(name, tasks, handovers) {
  const myNameUpper = name.toUpperCase();

  // Task IDs this person handed over (from their assignment)
  const handedOverIds = new Set(
    (handovers || []).filter(h => (h.fromName || '').toUpperCase() === myNameUpper)
      .flatMap(h => h.taskIds || [])
  );

  // Task IDs handed over TO this person
  const receivedIds = new Set(
    (handovers || []).filter(h => (h.toName || '').toUpperCase() === myNameUpper)
      .flatMap(h => h.taskIds || [])
  );

  // Build parent lookup once (used by the cycle-dedup pass below)
  const taskById = {};
  tasks.forEach(t => { taskById[t.id] = t; });

  // ─── Cycle dedup ──────────────────────────────────────────────────────────
  // The auto-cycle engine (utils/autoCycleTasks) leaves a chain of historical
  // "done" tasks in the global tasks array — parent + every past child. Without
  // dedup, MIS counted the same logical task N times, inflating both the
  // numerator (completed) and denominator (assigned) and producing nonsense
  // like "Completed=2, Assigned=1". This pass keeps:
  //   • One done record per (name, assignedTo) chain — the most recent one
  //     (highest schedDate). This represents the latest completed cycle.
  //   • One pending record per parent — the current cycle child.
  //   • Grandchild rows whose parent is also a child — these are bug artifacts
  //     of older code and should not appear in MIS at all.
  const doneSignatures = new Set();
  const dedupedTasks = [];
  // First pass: keep all rows but flag the duplicates we'll drop
  const drop = new Set();
  // Drop grandchild rows (parent has parentTaskId too)
  tasks.forEach(t => {
    if (t.parentTaskId) {
      const parent = taskById[t.parentTaskId];
      if (parent && parent.parentTaskId) drop.add(t.id);
    }
  });
  // Drop duplicate done rows — same name + assignedTo + schedDate is the same cycle
  tasks.forEach(t => {
    if (drop.has(t.id)) return;
    if (t.status === 'done') {
      const sig = `${(t.name || '').toUpperCase()}|${(t.assignedTo || []).slice().sort().join(',')}|${t.schedDate || ''}`;
      if (doneSignatures.has(sig)) { drop.add(t.id); return; }
      doneSignatures.add(sig);
    }
  });
  tasks.forEach(t => { if (!drop.has(t.id)) dedupedTasks.push(t); });

  // Originally assigned tasks (using deduped set so we count each logical task once)
  const originalTasks = dedupedTasks.filter(t => isAssignedTo(t, name));

  // Tasks this person completed by name — needed for the "Completed" numerator.
  // A task counts as "completed by me" if ANY of:
  //   1) `doneBy` matches my full name (case-insensitive)
  //   2) `doneBy` matches the first word of my name (handles "Vibhav" recorded
  //      as `doneBy` when the employee record is "VIBHAV KUMAR SHIRVASTAVA")
  //   3) `doneBy` is empty/blank AND I'm in `assignedTo` AND the task is `done`
  //      AND it wasn't handed over by me to someone else. Older tasks and some
  //      seeded rows have `doneBy=''` even though the assignee finished them;
  //      without (3), Completed falls below Assigned and the score collapses.
  const firstNameUpper = name.split(/\s+/)[0].toUpperCase();
  const completedByMe = dedupedTasks.filter(t => {
    if (t.status !== 'done') return false;
    const doneByUpper = (t.doneBy || '').toUpperCase();
    if (doneByUpper === myNameUpper) return true;
    if (doneByUpper && doneByUpper === firstNameUpper) return true;
    if (!doneByUpper && isAssignedTo(t, name)) return true;
    return false;
  });

  // Exclude handed-over tasks that were completed by someone else (they go to the
  // recipient's head). This is computed from the full deduped set, not from
  // completedByMe — a task handed over by this person and finished by someone
  // else wouldn't pass the completedByMe filter (doneBy !== me) and so we must
  // check the original task list directly.
  const handedOverDoneByOther = dedupedTasks.filter(t =>
    handedOverIds.has(t.id) && t.status === 'done' && t.doneBy && t.doneBy.toUpperCase() !== myNameUpper
  );

  // Received handover tasks (not originally assigned to this person)
  const receivedTasks = dedupedTasks.filter(t => receivedIds.has(t.id) && !isAssignedTo(t, name));

  // Build the "Assigned" denominator from a Set of task IDs so the same task
  // can be counted by any one of three channels without inflation:
  //   1) originally assigned to me (originalTasks)
  //   2) handed over TO me (receivedTasks)
  //   3) I actually finished it via doneBy even if assignedTo was reassigned
  //      away mid-flight — the work landed on me, so I should be credited for
  //      it in both numerator and denominator.
  // Without (3), the numerator (completed) could exceed the denominator
  // (assigned) and produce the bug where Completed > Assigned in the table.
  const assignedIds = new Set();
  originalTasks.forEach(t => assignedIds.add(t.id));
  receivedTasks.forEach(t => assignedIds.add(t.id));
  completedByMe.forEach(t => assignedIds.add(t.id));
  // Subtract tasks I handed over and someone else completed — they're no
  // longer on my head. Only count those that were in my assigned set.
  const handedOverDoneByOtherIds = new Set(
    handedOverDoneByOther.filter(t => assignedIds.has(t.id)).map(t => t.id)
  );
  const assigned = assignedIds.size - handedOverDoneByOtherIds.size;

  const completed = completedByMe.length;
  const delayed = completedByMe.filter(t => wasCompletedLate(t)).length;
  const onTime = completed - delayed;
  // Simple completion-based score:
  //   Score = Completion% − (Delayed × 10)
  // where Completion% = (Completed / Assigned) × 100.
  // Completion% is clamped to [0,100] so a Completed > Assigned edge case from
  // historical data can't push the visible score above 100%. Final score is
  // clamped to [0,100] after subtracting the per-delay penalty.
  const completionPct = assigned > 0 ? Math.min(100, Math.max(0, (completed / assigned) * 100)) : 100;
  const score = Math.max(0, Math.min(100, Math.round(completionPct - delayed * 10)));
  return { assigned, completed, onTime, delayed, score };
}

function SummaryCard({ label, val, color }) {
  return (
    <div style={{ background: 'white', borderRadius: 11, border: '1px solid #d8e2ef', padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color }} />
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 28, color, lineHeight: 1 }}>{val}</div>
      <div style={{ fontSize: 10.5, color: '#6b7a90', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 4 }}>{label}</div>
    </div>
  );
}

const IS = { padding: '7px 12px', borderRadius: 7, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 12.5, color: '#1a2535', background: 'white', outline: 'none' };
const TH = { background: '#f3f7fc', padding: '9px 13px', textAlign: 'left', fontSize: 10.5, fontWeight: 800, color: '#6b7a90', letterSpacing: 0.8, textTransform: 'uppercase', borderBottom: '1px solid #d8e2ef', whiteSpace: 'nowrap' };
const TD = { padding: '10px 13px', fontSize: 13 };

// Initial date range per tab — each tab gets its own filter so switching
// tabs preserves the user's last selection. Stored as { preset, from, to, field }
// to match the DateRangePicker API. The `field` selector lets the user pick
// which date column on each row should be filtered (created vs due vs done).
const _initialRange = () => {
  const r = currentMonthRange();
  return { preset: 'currentMonth', from: r.from, to: r.to };
};

const FIELD_OPTIONS = {
  // For employee/dept tabs: tasks are filtered by created date.
  employee: [
    { value: 'created',  label: 'Task created date' },
    { value: 'lastDone', label: 'Task completion date' },
  ],
  // Delegation: created vs due vs actual completion
  delegation: [
    { value: 'created',  label: 'Issued date' },
    { value: 'schedDate', label: 'Due date' },
    { value: 'lastDone', label: 'Completion date' },
  ],
  // Handover: start date is the natural primary filter
  handover: [
    { value: 'dateStart', label: 'Handover start date' },
    { value: 'dateEnd',   label: 'Handover end date' },
  ],
  // Dept: same as employee
  department: [
    { value: 'created',  label: 'Task created date' },
    { value: 'lastDone', label: 'Task completion date' },
  ],
};

export default function MisReporting() {
  const { tasks, issues, depts, employees, handovers, delegations } = useApp();
  const { currentRole, currentUser } = useAuth();
  const [tab, setTab] = useState('employee');
  const [filterDept, setFilterDept] = useState('');
  const [filterEmp, setFilterEmp] = useState('');
  // Drill-down modal: when an employee row is clicked on the Handover or
  // Delegation tab, we open a modal listing just that employee's records.
  // Without this the user has to scroll through a noisy aggregate and
  // manually filter — clicking is much faster.
  const [drillEmp, setDrillEmp] = useState(null);

  // Role gating — main admin / admin with mis_view see everything; employees
  // get their data only. `isMain` controls the global aggregate view; for
  // employees both filters are hidden and locked to themselves.
  const isMain = currentRole === 'mainadmin';
  const isAdminRole = isMain || currentRole === 'admin';
  // For employees: force filterDept to their dept and filterEmp to their name
  // (so all data is scoped). Reset the user-facing filters below.
  const myEmpName = (currentUser?.name || '').toUpperCase();
  const myEmpRecord = useMemo(
    () => (employees || []).find((e) => (e.name || '').toUpperCase() === myEmpName),
    [employees, myEmpName]
  );
  // Effective filters — what the data layer actually uses.
  const effDept = isAdminRole ? filterDept : (myEmpRecord?.dept || currentUser?.dept || '');
  const effEmp = isAdminRole ? filterEmp : (currentUser?.name || '');

  // Reset user-facing filters when role changes (defensive — usually a no-op).
  // When a non-admin lands on this page, the dept/emp dropdowns are hidden
  // and the data is locked to themselves, so we don't even render them.
  // Employee dropdown options — filtered by selected dept.
  const empOptions = useMemo(() => {
    return employees
      .filter((e) => !filterDept || e.dept === filterDept)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [employees, filterDept]);

  // When the admin picks an employee, lock the dept dropdown to that employee's
  // department so the two filters stay consistent (and the table doesn't show
  // employees from other depts as the dept label changes underneath).
  function handleEmpChange(name) {
    setFilterEmp(name);
    if (name) {
      const e = employees.find((x) => x.name === name);
      if (e?.dept) setFilterDept(e.dept);
    }
  }
  function handleDeptChange(d) {
    setFilterDept(d);
    // Clear the employee filter if they no longer belong to the new dept.
    if (filterEmp) {
      const e = employees.find((x) => x.name === filterEmp);
      if (!e || e.dept !== d) setFilterEmp('');
    }
  }

  // One date range per tab so switching tabs preserves the filter the
  // user set on each one. Each entry is { preset, from, to, field? }.
  const [rangeByTab, setRangeByTab] = useState({
    employee:   { ..._initialRange(), field: 'created' },
    delegation: { ..._initialRange(), field: 'created' },
    handover:   { ..._initialRange(), field: 'dateStart' },
    department: { ..._initialRange(), field: 'created' },
  });
  const range = rangeByTab[tab];
  const setRange = (next) => setRangeByTab((s) => ({ ...s, [tab]: next }));

  // Mobile-only: collapse the DateRangePicker behind a trigger button on
  // phones (CSS .mis-dr-trigger / .mis-dr-collapsible). Desktop shows the
  // picker inline — this state is a no-op there. The label mirrors the
  // drilldown-modal pattern so the button is self-explanatory.
  const [misDrOpen, setMisDrOpen] = useState(false);
  const drLabel = (() => {
    if (range.preset === 'currentMonth') return 'Current Month';
    if (range.preset === 'last30') return 'Last 30 Days';
    if (range.preset === 'custom') {
      return range.from && range.to ? `${range.from} → ${range.to}` : 'Custom Range';
    }
    return 'Date Range';
  })();

  // Pull the active tab's tasks/handover through the date filter once so
  // every stat + chart + table below is consistent.
  //
  // "Current-date" rule (added): future-dated pending tasks (schedDate > today)
  // are dropped from every downstream tab/scoring. They are scheduled work,
  // not in-flight work, so they shouldn't inflate the "Assigned" denominator
  // nor pollute completion-rate / dept-health scores. Done tasks are always
  // included regardless of schedDate — they're history. Pending tasks with
  // no schedDate fall through (backstop for legacy rows).
  const today = toDay();
  const isCurrentDatePending = (t) => {
    if (t.status !== 'pending') return false;
    if (!t.schedDate) return true;
    return t.schedDate <= today;
  };
  const filteredTasks = useMemo(() => {
    let pool = tasks;
    // Step 1: drop future-dated pending tasks so MIS doesn't inflate
    //         scoring/tables with work that isn't actually due yet.
    pool = pool.filter((t) => t.status === 'done' || isCurrentDatePending(t));
    // Step 2: apply the user-selected date range on the chosen field.
    if (!range.from || !range.to) return pool;
    return pool.filter((t) => inDateRange(t[range.field || 'created'], range.from, range.to));
  }, [tasks, range.from, range.to, range.field]);

  const filteredHandovers = useMemo(() => {
    if (!range.from || !range.to) return handovers;
    return (handovers || []).filter((h) => inDateRange(h[range.field || 'dateStart'], range.from, range.to));
  }, [handovers, range.from, range.to, range.field]);

  // ─── Employee stats (driven by filteredTasks) ───────────────────────────────
  // Scope rules:
  //   • Employee role: only their own row
  //   • Admin with filterEmp: only that employee's row
  //   • Admin with filterDept (no filterEmp): all employees in that dept
  //   • Admin with no filters: all employees (aggregate view)
  const empStats = useMemo(() => {
    let pool = employees;
    if (!isAdminRole) {
      // Employee role — only self
      pool = employees.filter((e) => (e.name || '').toUpperCase() === myEmpName);
    } else {
      if (effDept) pool = pool.filter((e) => e.dept === effDept);
      if (effEmp)  pool = pool.filter((e) => e.name === effEmp);
    }
    return pool
      .map((e) => ({ emp: e, ...calcEmpStats(e.name, filteredTasks, filteredHandovers) }))
      .sort((a, b) => b.score - a.score);
  }, [employees, filteredTasks, filteredHandovers, effDept, effEmp, isAdminRole, myEmpName]);

  const totAssigned = empStats.reduce((s, e) => s + e.assigned, 0);
  const totCompleted = empStats.reduce((s, e) => s + e.completed, 0);
  const totOnTime = empStats.reduce((s, e) => s + e.onTime, 0);
  const totDelayed = empStats.reduce((s, e) => s + e.delayed, 0);
  const avgScore = empStats.length ? Math.round(empStats.reduce((s, e) => s + e.score, 0) / empStats.length) : 100;
  const maxAssigned = Math.max(...empStats.map(e => e.assigned), 1);

  // ─── Delegation stats (driven by filteredTasks + standalone delegation records) ──
  // Scope: admin sees all delegation tasks; employee only sees their own
  // (where they're in assignedTo). When filterEmp is set (admin only),
  // restrict to that employee's delegations too.
  //
  // Two sources of truth are merged here:
  //   1. Tasks with `freq === 'delegation'` — the older implementation
  //      writes these into workdesk-tasks when the user creates a delegation
  //      via the Assign Task flow.
  //   2. Standalone records in workdesk-delegations — written by Delegations.jsx.
  //      The dashboard donut uses (1) only, but the MIS report needs both
  //      so the user sees the full picture regardless of which flow was used.
  const delegTasks = useMemo(() => {
    let taskPool = filteredTasks.filter((t) => t.freq === 'delegation');
    if (!isAdminRole) {
      taskPool = taskPool.filter((t) => isAssignedTo(t, currentUser.name));
    } else if (effEmp) {
      taskPool = taskPool.filter((t) => isAssignedTo(t, effEmp));
    } else if (effDept) {
      taskPool = taskPool.filter((t) => t.dept === effDept);
    }
    // Normalise standalone records into the same shape as delegation tasks.
    let standPool = (delegations || []).map((d) => ({
      id: d.id,
      name: d.task,
      assignedTo: [d.doerName],
      createdBy: d.createdBy || '',
      created: d.createdAt || '',
      schedDate: d.dueDate || '',
      extensions: d.extensionRequests || [],
      status: d.status === 'done' ? 'done' : 'pending',
      lastDone: '',
      dept: d.dept || '',
      remarks: d.remarks || '',
      _source: 'delegations',
    }));
    if (!isAdminRole) {
      standPool = standPool.filter((t) => isAssignedTo(t, currentUser.name));
    } else if (effEmp) {
      standPool = standPool.filter((t) => isAssignedTo(t, effEmp));
    } else if (effDept) {
      standPool = standPool.filter((t) => t.dept === effDept);
    }
    return [...taskPool, ...standPool];
  }, [filteredTasks, delegations, isAdminRole, effEmp, effDept, currentUser]);
  const delegDone = delegTasks.filter(t => t.status === 'done');
  const delegPending = delegTasks.filter(t => t.status === 'pending');
  const totalExts = delegTasks.reduce((s, t) => s + (t.extensions || []).length, 0);

  // ─── Dept stats (driven by filteredTasks + issues) ──────────────────────────
  // Scope: admin without filters sees all depts; admin with effDept sees only
  // that dept; admin with effEmp sees that employee's dept; employee sees only
  // their own dept.
  const deptStats = useMemo(() => {
    let pool = depts;
    if (!isAdminRole) {
      pool = depts.filter((d) => d.name === (myEmpRecord?.dept || currentUser?.dept));
    } else if (effEmp) {
      const eRec = employees.find((x) => x.name === effEmp);
      pool = depts.filter((d) => d.name === eRec?.dept);
    } else if (effDept) {
      pool = depts.filter((d) => d.name === effDept);
    }
    return pool.map(d => {
      const dTasks = filteredTasks.filter(t => t.dept === d.name);
      const done = dTasks.filter(t => t.status === 'done');
      const delayed = done.filter(t => wasCompletedLate(t));
      const openIss = issues.filter(i => i.dept === d.name && i.status !== 'resolved').length;
      const resolvedIss = issues.filter(i => i.dept === d.name && i.status === 'resolved').length;
      const taskComp = dTasks.length ? Math.round(done.length / dTasks.length * 100) : 100;
      const delayPct = done.length ? Math.round(delayed.length / done.length * 100) : 0;
      const issuePct = (openIss + resolvedIss) ? Math.round(resolvedIss / (openIss + resolvedIss) * 100) : 100;
      const healthScore = Math.round((taskComp * 0.5) + ((100 - delayPct) * 0.3) + (issuePct * 0.2));
      return { dept: d.name, total: dTasks.length, done: done.length, pending: dTasks.length - done.length, delayed: delayed.length, openIss, resolvedIss, staff: employees.filter(e => e.dept === d.name).length, taskComp, delayPct, issuePct, healthScore };
    });
  }, [depts, filteredTasks, issues, employees, effDept, effEmp, isAdminRole, myEmpRecord, currentUser]);
  const avgHealth = deptStats.length ? Math.round(deptStats.reduce((s, d) => s + d.healthScore, 0) / deptStats.length) : 100;

  // ─── Handover scope — applied alongside the date filter ─────────────────────
  // Employee role: handovers where they are from or to.
  // Admin + effEmp: handovers involving that employee.
  // Admin + effDept: handovers in that department.
  // Admin no filters: all.
  const scopedHandovers = useMemo(() => {
    let pool = filteredHandovers;
    if (!isAdminRole) {
      pool = pool.filter((h) =>
        (h.fromName || '').toUpperCase() === myEmpName ||
        (h.toName || '').toUpperCase() === myEmpName
      );
    } else if (effEmp) {
      pool = pool.filter((h) => h.fromName === effEmp || h.toName === effEmp);
    } else if (effDept) {
      pool = pool.filter((h) => h.dept === effDept);
    }
    return pool;
  }, [filteredHandovers, isAdminRole, effEmp, effDept, myEmpName]);

  // Reset to default range (current month, default field) for the active tab.
  function resetActiveRange() {
    const r = _initialRange();
    const def = FIELD_OPTIONS[tab][0].value;
    setRange({ ...r, field: def });
  }

  // Compact "filter pill" summary shown in section headers so the user
  // always knows what range they're looking at without scanning back to
  // the picker.
  const RangePill = () => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: '#e8f4fd', border: '1px solid #bae6fd', borderRadius: 20, fontSize: 10.5, color: '#0369a1', fontWeight: 800 }}>
      📅 {range.from} → {range.to}
      {range.preset && range.preset !== 'custom' && <span style={{ color: '#1a7a4a' }}>({range.preset === 'currentMonth' ? 'this month' : 'last 30 days'})</span>}
    </span>
  );

  function handleExport() {
    const suffix = `${range.from}_to_${range.to}`;
    const field = range.field;
    if (tab === 'employee') {
      exportToExcel(empStats.map(({ emp, assigned, completed, onTime, delayed, score }) => ({
        'Employee': emp.name, 'Dept': emp.dept, 'Role': emp.role || '—',
        'Assigned': assigned, 'Completed': completed, 'On Time': onTime, 'Delayed': delayed,
        'Deduction': `-${delayed * 10}%`, 'Score': score, 'Grade': scoreLabel(score),
        'Date Field': field, 'Range': `${range.from} to ${range.to}`,
      })), `MIS_Employee_${suffix}`);
    } else if (tab === 'delegation') {
      exportToExcel(delegTasks.map(t => {
        const late = t.status === 'done' && wasCompletedLate(t);
        return {
          'Task': t.name, 'Dept': t.dept, 'Assignee': (t.assignedTo || []).join(', '),
          'Assigned By': t.createdBy || '—', 'Assigned Date': t.created || '—', 'Due Date': t.schedDate || '—',
          'Extensions': (t.extensions || []).length, 'Completed On': t.lastDone || '—',
          'Status': t.status === 'done' ? (late ? 'Done (Delayed)' : 'Done (On Time)') : 'Pending',
          'On Time / Delayed': t.status === 'done' ? (late ? '⏰ Delayed' : '✅ On Time') : '—',
        };
      }), `MIS_Delegation_${suffix}`);
    } else if (tab === 'handover') {
      exportToExcel(scopedHandovers.map(h => {
        const taskNames = (h.taskIds || []).map(id => tasks.find(t => t.id === id)?.name).filter(Boolean).join(', ');
        const doneCount = (h.taskIds || []).filter(id => tasks.find(t => t.id === id && t.status === 'done')).length;
        return {
          'From': h.fromName, 'To': h.toName, 'Dept': h.dept,
          'Date Start': h.dateStart, 'Date End': h.dateEnd,
          'Tasks': (h.taskIds || []).length, 'Completed': doneCount,
          'Notes': h.notes || '', 'Task Names': taskNames,
        };
      }), `MIS_Handover_${suffix}`);
    } else {
      exportToExcel(deptStats.map(s => ({
        'Dept': s.dept, 'Staff': s.staff, 'Total Tasks': s.total, 'Done': s.done,
        'Pending': s.pending, 'Delayed': s.delayed, 'Completion%': s.taskComp,
        'Delay%': s.delayPct, 'Open Issues': s.openIss, 'Health Score': s.healthScore,
        'Report Range': `${range.from} to ${range.to}`,
      })), `MIS_Dept_${suffix}`);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-title">
          <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>📑 MIS Reporting</h2>
          <div style={{ fontSize: 11.5, color: '#6b7a90', marginTop: 2 }}>
            {isAdminRole
              ? <>Filter by date range across every tab · <RangePill /></>
              : <>Showing <strong style={{ color: '#0d7377' }}>your personal</strong> MIS report · <RangePill /></>}
          </div>
        </div>
        <div className="page-header-actions">
          <button onClick={() => window.print()} style={{ padding: '7px 14px', borderRadius: 8, background: '#1a2535', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>🖨️ Print</button>
          <button onClick={handleExport} style={{ padding: '7px 14px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>📊 Excel</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {[['employee', '👤 Employee Performance'], ['delegation', '📤 Delegation Report'], ['handover', '🔄 Handover Report'], ['department', '🏢 Department Overview']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12.5, background: tab === key ? '#0d7377' : '#f3f7fc', color: tab === key ? 'white' : '#1a2535' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Date range filter — applies to the active tab.
          Mobile: hidden behind a trigger button (CSS .mis-dr-trigger shows the
          button + hides the picker; tap to expand). Desktop: picker stays inline. */}
      <div style={{ marginBottom: 20 }}>
        <button
          type="button"
          className="mis-dr-trigger"
          onClick={() => setMisDrOpen((v) => !v)}
          aria-expanded={misDrOpen}
        >
          <span>📅 Date Range: {drLabel}</span>
          <span style={{ fontSize: 10, color: '#6b7a90' }}>{misDrOpen ? '▲' : '▼'}</span>
        </button>
        <div className={`mis-dr-collapsible${misDrOpen ? ' is-open' : ''}`}>
          <DateRangePicker
            value={range}
            onChange={setRange}
            showField
            fieldOptions={FIELD_OPTIONS[tab]}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button onClick={resetActiveRange} style={{ padding: '5px 12px', borderRadius: 7, border: '1.5px solid #d8e2ef', background: 'white', color: '#0d7377', fontWeight: 800, fontSize: 11, cursor: 'pointer' }}>
            ↺ Reset filter
          </button>
        </div>
      </div>

      {/* ══════════ EMPLOYEE TAB ══════════ */}
      {tab === 'employee' && (
        <div>
          {/* Summary row */}
          <div className="mis-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12, marginBottom: 20 }}>
            <SummaryCard label="Avg Performance" val={`${avgScore}%`} color={scoreColor(avgScore)} />
            <SummaryCard label="Total Assigned" val={totAssigned} color="#0d7377" />
            <SummaryCard label="Total Completed" val={totCompleted} color="#1a7a4a" />
            <SummaryCard label="On Time" val={totOnTime} color="#0d7377" />
            <SummaryCard label="Delayed" val={totDelayed} color="#c0392b" />
            <SummaryCard label={isAdminRole && !effEmp ? 'Employees' : 'Records'} val={empStats.length} color="#6d28d9" />
          </div>

          {/* Filter */}
          <div className="mis-filter-row" style={{ marginBottom: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {isAdminRole && (
              <>
                <select value={filterDept} onChange={e => handleDeptChange(e.target.value)} style={IS}>
                  <option value="">ALL DEPARTMENTS</option>
                  {depts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
                <select value={filterEmp} onChange={e => handleEmpChange(e.target.value)} style={IS}>
                  <option value="">{filterDept ? `ALL ${filterDept} EMPLOYEES` : 'ALL EMPLOYEES'}</option>
                  {empOptions.map(e => <option key={e.id} value={e.name}>{e.name}{e.role ? ` · ${e.role}` : ''}</option>)}
                </select>
              </>
            )}
            {!isAdminRole && (
              <div className="mis-personal-pill" style={{ fontSize: 12, color: '#0d7377', fontWeight: 800, background: '#e8f4fd', border: '1px solid #bae6fd', padding: '6px 14px', borderRadius: 7 }}>
                👤 Showing your personal performance — {currentUser?.name}{myEmpRecord?.dept ? ` · ${myEmpRecord.dept}` : ''}
              </div>
            )}
          </div>

          {/* Charts row */}
          <div className="mis-breakdown-row" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, marginBottom: 20 }}>
            {/* Grouped bars per employee */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', padding: 18 }}>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: '#0b1e3d', marginBottom: 16 }}>📊 Employee Task Breakdown</div>
              {empStats.length ? empStats.map(({ emp, assigned, completed, onTime, delayed }) => (
                <GroupedBar key={emp.id} label={emp.name} maxVal={maxAssigned || 1} bars={[
                  { label: 'Assigned', value: assigned, color: '#0d7377' },
                  { label: 'On Time', value: onTime, color: '#1a7a4a' },
                  { label: 'Delayed', value: delayed, color: '#c0392b' },
                ]} />
              )) : <div style={{ color: '#6b7a90', fontSize: 12 }}>No data</div>}
            </div>

            {/* Donut + legend */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', padding: 18 }}>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: '#0b1e3d', marginBottom: 14 }}>🎯 Overall Breakdown</div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <DonutChart size={150} centerLabel={`${totCompleted}`} centerSub="Done" data={[
                  { value: totOnTime, color: '#1a7a4a' },
                  { value: totDelayed, color: '#6d28d9' },
                  { value: Math.max(0, totAssigned - totCompleted), color: '#d4920a' },
                ]} />
              </div>
              {[
                { color: '#1a7a4a', label: 'On Time', val: totOnTime },
                { color: '#6d28d9', label: 'Delayed', val: totDelayed },
                { color: '#d4920a', label: 'Pending', val: Math.max(0, totAssigned - totCompleted) },
              ].map(({ color, label, val }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, marginBottom: 7 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ flex: 1, color: '#6b7a90' }}>{label}</span>
                  <strong style={{ color }}>{val}</strong>
                </div>
              ))}

              {/* Performance score bars */}
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #e4eaf2' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>Performance Score</div>
                <HBarChart maxVal={100} data={empStats.map(e => ({ label: e.emp.name, value: e.score, display: `${e.score}%`, color: scoreColor(e.score) }))} />
              </div>
            </div>
          </div>

          {/* Employee table */}
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['#', 'Employee', 'Dept', 'Assigned', 'Completed', 'On Time', 'Delayed', 'Deduction', 'Score', 'Grade'].map(h => (
                    <th key={h} style={TH}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {empStats.map(({ emp, assigned, completed, onTime, delayed, score }, i) => (
                    <tr key={emp.id} style={{ background: 'white' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fbff'}
                      onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                      <td style={{ ...TD, color: '#6b7a90', fontWeight: 800 }}>{i + 1}</td>
                      <td style={TD}>
                        <div style={{ fontWeight: 800 }}>{emp.name}</div>
                        {emp.role && <div style={{ fontSize: 10.5, color: '#6b7a90' }}>{emp.role}</div>}
                      </td>
                      <td style={TD}><DeptTag name={emp.dept} /></td>
                      <td style={{ ...TD, fontWeight: 700 }}>{assigned}</td>
                      <td style={{ ...TD, color: '#1a7a4a', fontWeight: 700 }}>{completed}</td>
                      <td style={{ ...TD, color: '#0d7377', fontWeight: 700 }}>{onTime}</td>
                      <td style={{ ...TD, color: delayed > 0 ? '#c0392b' : '#1a2535', fontWeight: delayed > 0 ? 800 : 600 }}>{delayed}</td>
                      <td style={{ ...TD, color: '#c0392b', fontWeight: 700 }}>−{delayed * 10}%</td>
                      <td style={TD}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 56, height: 6, background: '#e4eaf2', borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
                            <div style={{ height: '100%', width: `${score}%`, background: scoreColor(score), borderRadius: 10 }} />
                          </div>
                          <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, color: scoreColor(score), fontWeight: 900 }}>{score}</span>
                        </div>
                      </td>
                      <td style={{ ...TD, fontWeight: 800, color: scoreColor(score) }}>{scoreEmoji(score)} {scoreLabel(score)}</td>
                    </tr>
                  ))}
                  {!empStats.length && <tr><td colSpan={10} style={{ padding: 28, textAlign: 'center', color: '#6b7a90' }}>No employee data available</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ padding: '9px 14px', background: '#f8fbff', border: '1px solid #d8e2ef', borderRadius: 8, fontSize: 11.5, color: '#6b7a90' }}>
            📐 <strong>Score Formula:</strong> (Completed ÷ Assigned × 100) − (Delayed Count × 10) &nbsp;|&nbsp; Range: 0–100
          </div>
        </div>
      )}

      {/* ══════════ DELEGATION TAB ══════════ */}
      {tab === 'delegation' && (
        <div>
          {/* Summary */}
          <div className="mis-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12, marginBottom: 20 }}>
            <SummaryCard label="Total Delegation" val={delegTasks.length} color="#d4920a" />
            <SummaryCard label="Completed" val={delegDone.length} color="#1a7a4a" />
            <SummaryCard label="Pending" val={delegPending.length} color="#c0392b" />
            <SummaryCard label="Total Extensions" val={totalExts} color="#6d28d9" />
          </div>

          {/* Charts row */}
          <div className="mis-breakdown-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {/* Status donut */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', padding: 18, display: 'flex', gap: 20, alignItems: 'center' }}>
              <DonutChart size={130} centerLabel={`${delegTasks.length}`} centerSub="Total" data={[
                { value: delegDone.length, color: '#1a7a4a' },
                { value: delegPending.length, color: '#d4920a' },
              ]} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: '#0b1e3d', marginBottom: 12 }}>Delegation Status</div>
                {[
                  { color: '#1a7a4a', label: 'Completed', val: delegDone.length },
                  { color: '#d4920a', label: 'Pending', val: delegPending.length },
                ].map(({ color, label, val }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9, fontSize: 13 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: '#6b7a90' }}>{label}</span>
                    <strong style={{ color }}>{val}</strong>
                  </div>
                ))}
              </div>
            </div>

            {/* Extensions bar chart */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', padding: 18 }}>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: '#0b1e3d', marginBottom: 14 }}>🔄 Extensions per Task</div>
              {delegTasks.length ? (
                <HBarChart maxVal={3} data={delegTasks.map(t => {
                  const n = (t.extensions || []).length;
                  return { label: t.name, value: n, display: `${n}/3`, color: n >= 3 ? '#c0392b' : n > 0 ? '#d4920a' : '#1a7a4a' };
                })} />
              ) : <div style={{ color: '#6b7a90', fontSize: 12 }}>No delegation tasks</div>}
            </div>
          </div>

          {/* Consolidated Delegation Table */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, color: '#0b1e3d' }}>📋 Consolidated Delegation Report</div>
            <RangePill />
          </div>
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['Task', 'Assignee', 'Assigned By', 'Assigned Date', 'Due Date', 'Extensions', 'Completed On', 'Status'].map(h => (
                    <th key={h} style={TH}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {delegTasks.length ? delegTasks.map(t => {
                    const exts = t.extensions || [];
                    return (
                      <tr key={t.id} style={{ background: 'white' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8fbff'}
                        onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                        <td style={{ ...TD, fontWeight: 700, maxWidth: 160 }}>{t.name}</td>
                        <td style={{ ...TD, fontSize: 12 }}>{(t.assignedTo || []).join(', ') || '—'}</td>
                        <td style={{ ...TD, fontSize: 12, color: '#6b7a90' }}>{t.createdBy || '—'}</td>
                        <td style={{ ...TD, color: '#0d7377', fontWeight: 700 }}>{t.created ? fDate(t.created) : '—'}</td>
                        <td style={{ ...TD, color: '#0d7377', fontWeight: 700 }}>{t.schedDate ? fDate(t.schedDate) : '—'}</td>
                        <td style={TD}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ fontWeight: 800, color: exts.length > 0 ? '#d4920a' : '#6b7a90' }}>{exts.length}/3</span>
                            <div style={{ display: 'flex', gap: 2 }}>
                              {exts.map((x, i) => (
                                <div key={i} title={`${x.status} — ${fDate(x.newDate)}`} style={{ width: 8, height: 8, borderRadius: '50%', background: x.status === 'approved' ? '#1a7a4a' : x.status === 'rejected' ? '#c0392b' : '#f5c842' }} />
                              ))}
                            </div>
                          </div>
                        </td>
                        <td style={{ ...TD, color: '#1a7a4a', fontWeight: 700 }}>{t.lastDone ? fDate(t.lastDone) : '—'}</td>
                        <td style={TD}>
                          {t.status === 'done'
                            ? (wasCompletedLate(t)
                              ? <span style={{ background: '#ede9fe', color: '#4c1d95', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>⏰ Done (Delayed)</span>
                              : <span style={{ background: '#d4edda', color: '#155724', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>✅ Done (On Time)</span>)
                            : <span style={{ background: '#fff3cd', color: '#7a4800', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>⏳ Pending</span>}
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#6b7a90' }}>No delegation tasks yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Extension history cards */}
          {delegTasks.some(t => (t.extensions || []).length > 0) && (
            <div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, color: '#0b1e3d', marginBottom: 12 }}>🔄 Extension Request Detail</div>
              {delegTasks.filter(t => (t.extensions || []).length > 0).map(t => (
                <div key={t.id} style={{ background: 'white', border: '1px solid #d8e2ef', borderRadius: 11, padding: '14px 16px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    <span style={{ fontWeight: 800, fontSize: 13 }}>{t.name}</span>
                    <div style={{ display: 'flex', gap: 12, fontSize: 11.5, color: '#6b7a90' }}>
                      <span>👤 {(t.assignedTo || []).join(', ')}</span>
                      <span>📌 Assigned: {t.created ? fDate(t.created) : '—'}</span>
                      {t.lastDone && <span>✅ Done: {fDate(t.lastDone)}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(t.extensions || []).map((x, i) => (
                      <div key={x.id} style={{ background: x.status === 'approved' ? '#f0fdf4' : x.status === 'rejected' ? '#fff5f5' : '#fffbeb', border: `1px solid ${x.status === 'approved' ? '#86efac' : x.status === 'rejected' ? '#fca5a5' : '#f5c842'}`, borderRadius: 8, padding: '9px 12px', fontSize: 11.5, minWidth: 148 }}>
                        <div style={{ fontWeight: 800, marginBottom: 4, fontSize: 12 }}>Extension #{i + 1}</div>
                        <div style={{ color: '#6b7a90', marginBottom: 2 }}>By: <strong style={{ color: '#1a2535' }}>{x.reqBy}</strong></div>
                        <div style={{ color: '#6b7a90', marginBottom: 2 }}>Requested: <strong>{fDate(x.reqAt)}</strong></div>
                        <div style={{ color: '#0d7377', marginBottom: 4 }}>New Date: <strong>{fDate(x.newDate)}</strong></div>
                        {x.reason && <div style={{ color: '#6b7a90', fontSize: 10.5, fontStyle: 'italic', marginBottom: 4 }}>"{x.reason}"</div>}
                        <span style={{ fontSize: 10, fontWeight: 800, color: x.status === 'approved' ? '#155724' : x.status === 'rejected' ? '#7d1a1a' : '#92400e' }}>
                          {x.status === 'approved' ? '✅ Approved' : x.status === 'rejected' ? '❌ Rejected' : '⏳ Pending'}
                          {x.respondedBy ? ` by ${x.respondedBy}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════ HANDOVER TAB ══════════ */}
      {tab === 'handover' && (() => {
        const today = toDay();
        const newHandovers = scopedHandovers.filter(h => h.dateStart);
        const activeH = newHandovers.filter(h => today >= h.dateStart && today <= h.dateEnd);
        const upcomingH = newHandovers.filter(h => today < h.dateStart);
        const completedH = newHandovers.filter(h => today > h.dateEnd);

        return (
          <div>
            {/* Summary */}
            <div className="mis-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12, marginBottom: 20 }}>
              <SummaryCard label="Total Handovers" val={newHandovers.length} color="#0d7377" />
              <SummaryCard label="Active Now" val={activeH.length} color="#1a7a4a" />
              <SummaryCard label="Upcoming" val={upcomingH.length} color="#1a56db" />
              <SummaryCard label="Completed" val={completedH.length} color="#6b7a90" />
            </div>

            {/* Employee-wise handover summary */}
            {newHandovers.length > 0 && (() => {
              // Per-employee: how many tasks they received via handover and completed.
              // Skip rows without a recipient (legacy data) — without this guard
              // every blank-recipient handover would collapse into one ghost row.
              const empHandoverMap = {};
              newHandovers.forEach(h => {
                const key = (h.toName || '').trim() || '(unknown recipient)';
                if (!empHandoverMap[key]) empHandoverMap[key] = { received: 0, completed: 0, handovers: [] };
                empHandoverMap[key].received += (h.taskIds || []).length;
                empHandoverMap[key].completed += (h.taskIds || []).filter(id => {
                  const t = tasks.find(x => x.id === id);
                  return t && t.status === 'done';
                }).length;
                empHandoverMap[key].handovers.push(h);
              });
              return (
                <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', padding: 18, marginBottom: 20 }}>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: '#0b1e3d', marginBottom: 14 }}>📊 Employee-wise Handover Summary</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>{['Employee (Received From)', 'Handovers Received', 'Tasks Received', 'Tasks Completed', 'Completion%'].map(h => (
                          <th key={h} style={TH}>{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {Object.entries(empHandoverMap).map(([empName, stat]) => {
                          const pct = stat.received > 0 ? Math.round((stat.completed / stat.received) * 100) : 0;
                          return (
                            <tr key={empName} style={{ background: 'white', cursor: 'pointer' }}
                              onClick={() => setDrillEmp({ name: empName, kind: 'handover' })}
                              onMouseEnter={e => e.currentTarget.style.background = '#f8fbff'}
                              onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                              <td style={TD}>
                                <div style={{ fontWeight: 800 }}>{empName}</div>
                                <div style={{ fontSize: 10.5, color: '#6b7a90' }}>from: {stat.handovers.map(h => h.fromName).join(', ')}</div>
                              </td>
                              <td style={{ ...TD, color: '#0d7377', fontWeight: 700 }}>{stat.handovers.length}</td>
                              <td style={{ ...TD, fontWeight: 700 }}>{stat.received}</td>
                              <td style={{ ...TD, color: '#1a7a4a', fontWeight: 700 }}>{stat.completed}</td>
                              <td style={TD}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ width: 56, height: 6, background: '#e4eaf2', borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
                                    <div style={{ height: '100%', width: `${pct}%`, background: scoreColor(pct), borderRadius: 10 }} />
                                  </div>
                                  <span style={{ fontWeight: 800, color: scoreColor(pct) }}>{pct}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* Detailed handover table */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, color: '#0b1e3d' }}>📋 All Handover Records</div>
              <RangePill />
            </div>
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>{['From', 'To', 'Dept', 'Date Start', 'Date End', 'Tasks', 'Done', 'Status', 'Notes'].map(h => (
                      <th key={h} style={TH}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {newHandovers.length ? newHandovers
                      .sort((a, b) => b.dateStart.localeCompare(a.dateStart))
                      .map(h => {
                        const st = today >= h.dateStart && today <= h.dateEnd ? 'active' : today < h.dateStart ? 'upcoming' : 'completed';
                        const doneCount = (h.taskIds || []).filter(id => tasks.find(t => t.id === id && t.status === 'done')).length;
                        return (
                          <tr key={h.id} style={{ background: 'white' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f8fbff'}
                            onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                            <td style={{ ...TD, fontWeight: 700 }}>{h.fromName}</td>
                            <td style={{ ...TD, fontWeight: 700, color: '#0d7377' }}>{h.toName}</td>
                            <td style={TD}>{h.dept ? <DeptTag name={h.dept} /> : '—'}</td>
                            <td style={{ ...TD, color: '#0d7377', fontWeight: 700 }}>{fDate(h.dateStart)}</td>
                            <td style={{ ...TD, color: '#0d7377', fontWeight: 700 }}>{fDate(h.dateEnd)}</td>
                            <td style={{ ...TD, fontWeight: 700 }}>{(h.taskIds || []).length}</td>
                            <td style={{ ...TD, color: '#1a7a4a', fontWeight: 700 }}>{doneCount}</td>
                            <td style={TD}>
                              <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800, background: st === 'active' ? '#d4edda' : st === 'upcoming' ? '#cfe2ff' : '#e4eaf2', color: st === 'active' ? '#155724' : st === 'upcoming' ? '#0a3870' : '#4a5568' }}>
                                {st === 'active' ? '🟢 Active' : st === 'upcoming' ? '🔵 Upcoming' : '✅ Done'}
                              </span>
                            </td>
                            <td style={{ ...TD, fontSize: 11.5, color: '#6b7a90', maxWidth: 160 }}>{h.notes || '—'}</td>
                          </tr>
                        );
                      }) : (
                      <tr><td colSpan={9} style={{ padding: 28, textAlign: 'center', color: '#6b7a90' }}>No handover records found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══════════ EMPLOYEE DRILL-DOWN MODAL ══════════ */}
      {drillEmp && drillEmp.kind === 'handover' && (() => {
        const empName = drillEmp.name;
        const empUpper = empName.toUpperCase();
        const list = (scopedHandovers || []).filter((h) => (h.toName || '').toUpperCase() === empUpper);
        return (
          <Modal open={!!drillEmp} onClose={() => setDrillEmp(null)} title={`🔄 Handovers to ${empName} (${list.length})`} maxWidth="max-w-3xl">
            {list.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {list.sort((a, b) => (b.dateStart || '').localeCompare(a.dateStart || '')).map((h) => {
                  const st = (() => { const t = toDay(); if (!h.dateStart) return 'pending'; return t >= h.dateStart && t <= h.dateEnd ? 'active' : t < h.dateStart ? 'upcoming' : 'completed'; })();
                  const doneCount = (h.taskIds || []).filter((id) => { const t = tasks.find((x) => x.id === id); return t && t.status === 'done'; }).length;
                  return (
                    <div key={h.id} style={{ background: '#f8fbff', borderRadius: 10, border: '1px solid #d8e2ef', padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                        <strong style={{ fontSize: 13 }}>From: {h.fromName || '—'}</strong>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 10px', borderRadius: 20, color: 'white', background: st === 'active' ? '#1a7a4a' : st === 'upcoming' ? '#1a56db' : st === 'completed' ? '#6b7a90' : '#d4920a', textTransform: 'uppercase' }}>{st}</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: '#6b7a90' }}>
                        📅 {h.dateStart ? fDate(h.dateStart) : '—'} → {h.dateEnd ? fDate(h.dateEnd) : '—'} &nbsp;|&nbsp; Tasks: {doneCount}/{(h.taskIds || []).length} done
                      </div>
                      {h.notes && <div style={{ fontSize: 11, color: '#6b7a90', marginTop: 4 }}>📝 {h.notes}</div>}
                    </div>
                  );
                })}
              </div>
            ) : <div style={{ color: '#6b7a90', textAlign: 'center', padding: 24 }}>No handover records found for {empName}.</div>}
          </Modal>
        );
      })()}

      {/* ══════════ DEPARTMENT TAB ══════════ */}
      {tab === 'department' && (
        <div>
          {/* Overall health card — only meaningful for unscoped admin view */}
          {(!isAdminRole || (!effDept && !effEmp)) && isAdminRole && (
            <div style={{ background: 'white', borderRadius: 14, border: '1px solid #d8e2ef', padding: 20, marginBottom: 18, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: scoreColor(avgHealth) }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: '#0b1e3d' }}>Work Health Score</div>
                  <div style={{ fontSize: 12, color: '#6b7a90', marginTop: 3 }}>{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 52, color: scoreColor(avgHealth), lineHeight: 1 }}>{avgHealth}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: scoreColor(avgHealth) }}>{scoreEmoji(avgHealth)} {scoreLabel(avgHealth)}</div>
                </div>
              </div>
          </div>
          )}

          {/* Dept chart */}
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', padding: 18, marginBottom: 16 }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: '#0b1e3d', marginBottom: 14 }}>📊 Department Health Scores</div>
            <HBarChart maxVal={100} data={deptStats.map(d => ({ label: d.dept, value: d.healthScore, display: `${d.healthScore} — ${scoreEmoji(d.healthScore)}`, color: scoreColor(d.healthScore) }))} />
          </div>

          {/* Dept table */}
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['Department', 'Staff', 'Tasks', 'Done', 'Pending', 'Delayed', 'Completion%', 'Delay%', 'Open Issues', 'Health', 'Grade'].map(h => (
                    <th key={h} style={TH}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {deptStats.map(s => (
                    <tr key={s.dept} style={{ background: 'white' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fbff'}
                      onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                      <td style={TD}><DeptTag name={s.dept} /></td>
                      <td style={TD}>{s.staff}</td>
                      <td style={TD}>{s.total}</td>
                      <td style={{ ...TD, color: '#1a7a4a', fontWeight: 700 }}>{s.done}</td>
                      <td style={{ ...TD, color: '#d4920a', fontWeight: s.pending > 0 ? 700 : 400 }}>{s.pending}</td>
                      <td style={{ ...TD, color: s.delayed > 0 ? '#c0392b' : '#6b7a90', fontWeight: s.delayed > 0 ? 800 : 400 }}>{s.delayed}</td>
                      <td style={TD}>{s.taskComp}%</td>
                      <td style={{ ...TD, color: s.delayPct > 20 ? '#c0392b' : '#1a2535', fontWeight: s.delayPct > 20 ? 800 : 400 }}>{s.delayPct}%</td>
                      <td style={{ ...TD, color: s.openIss > 0 ? '#c0392b' : '#6b7a90' }}>{s.openIss}</td>
                      <td style={TD}><span style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, color: scoreColor(s.healthScore), fontWeight: 700 }}>{s.healthScore}</span></td>
                      <td style={{ ...TD, fontWeight: 800, color: scoreColor(s.healthScore) }}>{scoreEmoji(s.healthScore)} {scoreLabel(s.healthScore)}</td>
                    </tr>
                  ))}
                  {!deptStats.length && <tr><td colSpan={11} style={{ padding: 28, textAlign: 'center', color: '#6b7a90' }}>No departments found</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
