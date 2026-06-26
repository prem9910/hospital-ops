import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { uid, toDay, fDate, fDateTime, wasCompletedLate, parseTimeToMinutes, isTaskDueToday, exportToExcel } from '../utils';
import { FREQ_LABELS } from '../constants';
import { DeptTag, PriorityBadge, FreqBadge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { Alert, EmptyState } from '../components/common/Alert';
import { Pagination, paginate } from '../components/common/Pagination';
import { sendTaskCompletedEmail } from '../lib/emailService';

const IS = { width: '100%', padding: '9px 13px', borderRadius: 8, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 13, color: '#1a2535', outline: 'none', background: 'white', fontWeight: 600 };
function Field({ label, children }) {
  return <div style={{ marginBottom: 13 }}><label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</label>{children}</div>;
}

function DoneModal({ task, open, onClose, onSubmit }) {
  const [remark, setRemark] = useState('');
  const [delayReason, setDelayReason] = useState('');
  const now = new Date();
  const nowStr = now.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
  const sm = task ? parseTimeToMinutes(task.time) : null;
  // Delayed if: completing after scheduled date OR completing after scheduled time today
  const isDateOverdue = task?.schedDate ? toDay() > task.schedDate : false;
  const isTimeOverdue = sm !== null ? now.getHours() * 60 + now.getMinutes() > sm : false;
  const isDelayed = isDateOverdue || isTimeOverdue;

  function handleSubmit() {
    if (isDelayed && !delayReason.trim()) { alert('Delay reason required!'); return; }
    onSubmit({ remark: remark.toUpperCase(), delayReason: delayReason.toUpperCase(), isDelayed });
    setRemark(''); setDelayReason('');
  }

  if (!task) return null;
  return (
    <Modal open={open} onClose={onClose} title="✅ Mark Task Complete" maxWidth="max-w-md">
      <Alert variant="blue">Task completion will be logged with your name and the current time!</Alert>
      <Field label="Task"><input disabled value={task.name} style={{ ...IS, background: '#f5f8fc', color: '#6b7a90' }} /></Field>
      <Field label="Scheduled Date"><input disabled value={task.schedDate ? fDate(task.schedDate) : '—'} style={{ ...IS, background: '#f5f8fc', color: '#6b7a90' }} /></Field>
      <Field label="Completed At (Auto)"><input disabled value={nowStr} style={{ ...IS, background: '#f5f8fc', color: '#0d7377', fontWeight: 800 }} /></Field>
      {isDelayed && (
        <>
          <Alert variant="orange">⏰ <strong>Task is DELAYED!</strong> Delay reason mandatory.</Alert>
          <Field label="Delay Reason *">
            <textarea value={delayReason} onChange={(e) => setDelayReason(e.target.value)} placeholder="EXPLAIN WHY DELAYED..." style={{ ...IS, minHeight: 80, resize: 'vertical' }} />
          </Field>
        </>
      )}
      <Field label="Remark (Optional)">
        <textarea value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="ANY NOTES..." style={{ ...IS, minHeight: 55, resize: 'vertical' }} />
      </Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid #d8e2ef' }}>
        <button onClick={handleSubmit} style={{ padding: '9px 18px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>✅ Yes, Task Complete!</button>
        <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>Cancel</button>
      </div>
    </Modal>
  );
}

function ExtensionRequestModal({ task, open, onClose, onSubmit }) {
  const [newDate, setNewDate] = useState('');
  const [reason, setReason] = useState('');

  function handleSubmit() {
    if (!newDate) { alert('New due date required!'); return; }
    if (!reason.trim()) { alert('Reason required!'); return; }
    onSubmit({ newDate, reason: reason.trim() });
    setNewDate(''); setReason('');
  }

  if (!task) return null;
  const exts = task.extensions || [];

  return (
    <Modal open={open} onClose={onClose} title="🔄 Request Extension" maxWidth="max-w-md">
      <Alert variant="blue">Extension request will be sent to admin for approval. Maximum 3 extensions allowed.</Alert>
      <div style={{ background: '#f8fbff', border: '1px solid #d8e2ef', borderRadius: 8, padding: '10px 13px', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{task.name}</div>
        <div style={{ fontSize: 12, color: '#6b7a90' }}>📅 Current Due Date: <strong style={{ color: '#0d7377' }}>{fDate(task.schedDate)}</strong></div>
        <div style={{ fontSize: 12, color: '#6b7a90', marginTop: 2 }}>🔄 Extensions Used: <strong>{exts.length}/3</strong> ({3 - exts.length} remaining)</div>
      </div>
      <Field label="New Due Date *">
        <input type="date" value={newDate} min={toDay()} onChange={(e) => setNewDate(e.target.value)} style={IS} />
      </Field>
      <Field label="Reason for Extension *">
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why you need more time..." style={{ ...IS, minHeight: 80, resize: 'vertical' }} />
      </Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid #d8e2ef' }}>
        <button onClick={handleSubmit} style={{ padding: '9px 18px', borderRadius: 8, background: '#d4920a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>🔄 Submit Request</button>
        <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>Cancel</button>
      </div>
    </Modal>
  );
}

export default function MyTasks() {
  const { currentUser } = useAuth();
  const { tasks, handovers, employees, notices, save, saveSingle, logAct, ensureCycles } = useApp();
  const [tab, setTab] = useState('task');

  // Ensure auto-cycled pending tasks exist as soon as this page loads
  useEffect(() => { if (tasks.length) ensureCycles(); }, [tasks.length]);

  const [showDone, setShowDone] = useState(null);
  const [showExtReq, setShowExtReq] = useState(null);
  const [pageTask, setPageTask] = useState(1);
  const [pageDelegation, setPageDelegation] = useState(1);
  const [pageHandoverFrom, setPageHandoverFrom] = useState(1);
  const [pageHandoverTo, setPageHandoverTo] = useState(1);
  const [pageDone, setPageDone] = useState(1);

  const today = toDay();
  const myName = currentUser.name.toUpperCase();

  // Quick lookup to detect grandchild tasks (bug artifacts from duplicate handover completions)
  const taskById = {};
  tasks.forEach(t => { taskById[t.id] = t; });
  const isGrandchild = (t) => {
    if (!t.parentTaskId) return false;
    const parent = taskById[t.parentTaskId];
    return !!(parent?.parentTaskId);
  };

  // Active handovers TO me (within date range, only accepted ones)
  const activeHandoversToMe = handovers.filter(h =>
    (h.toName || '').toUpperCase() === myName &&
    h.status === 'accepted' &&
    h.dateStart && h.dateEnd &&
    today >= h.dateStart && today <= h.dateEnd &&
    (h.taskIds || []).length > 0
  );
  const handoverTaskIdsForMe = new Set(activeHandoversToMe.flatMap(h => h.taskIds || []));

  // Handovers I submitted FROM me (any status, pending tasks only — to show "given away" badge)
  const myOutgoingHandovers = handovers.filter(h =>
    (h.fromName || '').toUpperCase() === myName &&
    (h.status === 'pending' || h.status === 'accepted')
  );
  // Map: taskId → handover (for highlighting tasks I handed over)
  const handedOverByMe = {};
  myOutgoingHandovers.forEach(h => {
    (h.taskIds || []).forEach(id => { handedOverByMe[id] = h; });
  });

  // Tasks actively locked (accepted handover within current date range) — Mark Done hidden for me
  const activelyHandedOverIds = new Set(
    handovers
      .filter(h =>
        (h.fromName || '').toUpperCase() === myName &&
        h.status === 'accepted' &&
        h.dateStart && h.dateEnd &&
        today >= h.dateStart && today <= h.dateEnd
      )
      .flatMap(h => h.taskIds || [])
  );

  // Find which handover a task belongs to (for display — received, active only)
  function getHandoverInfo(taskId) {
    return activeHandoversToMe.find(h => (h.taskIds || []).includes(taskId)) || null;
  }

  // For Done tab: find handover info from ALL handovers (not just active date range)
  function getAnyHandoverToMe(taskId) {
    return handovers.find(h =>
      (h.toName || '').toUpperCase() === myName &&
      (h.taskIds || []).includes(taskId)
    ) || null;
  }

  // For Done tab (PREM's view): find handover I gave away for a task
  function getHandoverFromMe(taskId) {
    return handovers.find(h =>
      (h.fromName || '').toUpperCase() === myName &&
      (h.taskIds || []).includes(taskId)
    ) || null;
  }

  // My own pending tasks — exclude grandchild tasks (bug artifacts) and deduplicate parent/child
  const ownPending = tasks.filter((t) =>
    t.assignedTo?.includes(currentUser.name) &&
    t.status === 'pending' &&
    isTaskDueToday(t) &&
    !isGrandchild(t) &&
    !tasks.some(x => x.parentTaskId === t.id && x.status === 'pending' && x.assignedTo?.includes(currentUser.name))
  );

  // Handover tasks for me — only match tasks whose own ID is in the handover (not children)
  // Children of handover tasks belong to the original assignee; MOHAN sees them via virtualPending below
  const handoverPendingReal = tasks.filter(t =>
    handoverTaskIdsForMe.has(t.id) &&
    t.status === 'pending' &&
    !t.assignedTo?.includes(currentUser.name)
  );
  // Daily handover tasks already completed — show again each day (like own-task virtualPending)
  const handoverVirtualPending = tasks.filter(t =>
    handoverTaskIdsForMe.has(t.id) &&
    t.status === 'done' &&
    t.freq === 'daily' &&
    t.lastDone < today &&
    !tasks.some(x => x.parentTaskId === t.id && x.status === 'pending')
  ).map(t => ({ ...t, _virtualPending: true }));
  const handoverPending = [...handoverPendingReal, ...handoverVirtualPending];

  // Recurring tasks that PREM completed but aren't yet cycled for today
  // Covers case where assignedTo != PREM but PREM was the doer
  const dueTodayUnCycled = tasks.filter(t =>
    t.status === 'done' &&
    !t.parentTaskId &&
    t.freq !== 'delegation' &&
    t.lastDone !== today &&
    isTaskDueToday(t) &&
    (t.assignedTo?.includes(currentUser.name) || t.doneBy === currentUser.name) &&
    !tasks.some(x => x.parentTaskId === t.id && x.status === 'pending' && x.assignedTo?.includes(currentUser.name))
  ).map(t => ({ ...t, _virtualPending: true }));

  // Deduplicate: children (with parentTaskId) take priority over parents
  const rawPending = [...ownPending, ...dueTodayUnCycled]
    .sort((a, b) => {
      if (a.parentTaskId && !b.parentTaskId) return -1;
      if (!a.parentTaskId && b.parentTaskId) return 1;
      return (b.schedDate || '').localeCompare(a.schedDate || '');
    });
  const seenRoots = new Set();
  const myPending = rawPending.filter(t => {
    const rootId = t.parentTaskId || t.id;
    if (seenRoots.has(rootId)) return false;
    seenRoots.add(rootId);
    return true;
  });

  // Split pending into 3 clean buckets — no overlap
  // Task: regular freq tasks, NOT delegation, NOT a task I've handed over to someone, NOT a handover received task
  const taskPending = myPending.filter(t =>
    t.freq !== 'delegation' &&
    !handedOverByMe[t.id] &&
    !handoverTaskIdsForMe.has(t.id)
  );
  // Delegation: only freq=delegation tasks
  const delegationPending = myPending.filter(t => t.freq === 'delegation');

  // Handover FROM others TO me (tasks received)
  const handoverFromTasks = handoverPending;

  // Handover TO others FROM me (handovers I created — all statuses)
  const handoverToList = handovers.filter(h =>
    (h.fromName || '').toUpperCase() === myName
  ).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const handoverCount = handoverFromTasks.length + handoverToList.length;

  // Done: ALL tasks I completed or were assigned to me (tasks + delegation + handover all combined)
  const myDone = tasks.filter(t =>
    (t.assignedTo?.includes(currentUser.name) || t.doneBy === currentUser.name ||
      handoverTaskIdsForMe.has(t.id)) &&
    t.status === 'done'
  );

  // After any task completion, check if employee has a pending dept change and all tasks are now done
  async function checkPendingDeptChange(completedTaskId) {
    const emp = employees.find(e => e.name.toUpperCase() === currentUser.name.toUpperCase());
    if (!emp?.pendingDept) return;
    // Count remaining pending tasks excluding the one just completed
    const remaining = tasks.filter(tx =>
      tx.id !== completedTaskId &&
      tx.status === 'pending' &&
      ((tx.assignedTo || []).includes(currentUser.name) || handoverTaskIdsForMe.has(tx.id))
    ).length;
    if (remaining > 0) return;
    // All tasks done — send dept_change_approval to employee + alert to main admin
    const nowIso = new Date().toISOString();
    const approvalNotice = {
      id: uid(), toEmpId: emp.id, toName: emp.name,
      fromName: 'MAIN ADMIN',
      subject: 'DEPARTMENT CHANGE REQUEST',
      message: `Dear ${emp.name},\n\nYou have completed all your pending tasks. Your department is now being changed from "${emp.dept}" to "${emp.pendingDept}".\n\nPlease accept this change at your earliest convenience.\n\nRegards,\nMAIN ADMIN`,
      type: 'dept_change_approval', isRead: false, sentAt: nowIso,
      meta: { newDept: emp.pendingDept, oldDept: emp.dept, empId: emp.id },
    };
    const adminAlert = {
      id: uid(), toEmpId: 'MAINADMIN', toName: 'MAIN ADMIN',
      fromName: emp.name,
      subject: `${emp.name} — ALL TASKS COMPLETED`,
      message: `${emp.name} has completed all pending tasks.\n\nDepartment change from "${emp.dept}" to "${emp.pendingDept}" approval has been sent to the employee.`,
      type: 'admin_alert', isRead: false, sentAt: nowIso, meta: null,
    };
    // Clear pendingDept from employee record
    const updatedEmps = employees.map(e => e.id === emp.id ? { ...e, pendingDept: '' } : e);
    await save('hops-employees', updatedEmps);
    await save('hops-notices', [...(notices || []), approvalNotice, adminAlert]);
  }

  async function handleDone({ remark, delayReason, isDelayed }) {
    const t = showDone;
    const nowStr = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });

    if (t._virtualPending) {
      const parentUpdated = { ...t, lastDone: today, _virtualPending: undefined };
      const child = {
        id: uid(), name: t.name, dept: t.dept, freq: t.freq,
        assignedTo: [...(t.assignedTo || [])], assigneeEmails: [...(t.assigneeEmails || [])],
        time: t.time || '', schedDate: today, priority: t.priority,
        notes: t.notes || '', status: 'done',
        doneBy: currentUser.name, doneTime: nowStr,
        doneRemark: remark, delayReason, isDelayed,
        lastDone: today, completionHistory: [],
        extensions: [], created: today, createdBy: 'SYSTEM',
        activityLog: [
          { by: 'SYSTEM', action: 'AUTO CYCLE', details: 'Freq: ' + t.freq, at: nowStr },
          { by: currentUser.name, action: 'COMPLETED' + (isDelayed ? ' (DELAYED)' : ''), details: remark, at: nowStr },
        ],
        parentTaskId: t.id,
      };
      const newAll = [...tasks.map(x => x.id === t.id ? parentUpdated : x), child];
      await saveSingle('hops-tasks', child, newAll);
      await saveSingle('hops-tasks', parentUpdated, newAll);
      await logAct('TASK COMPLETED', t.name);
      try { await checkPendingDeptChange(t.id); } catch (e) { console.error('Dept check failed', e); }
      setShowDone(null);
      return;
    }

    const updated = {
      ...t, status: 'done', doneBy: currentUser.name, doneTime: nowStr,
      doneRemark: remark, delayReason, isDelayed, lastDone: toDay(),
      activityLog: [...(t.activityLog || []), { by: currentUser.name, action: 'COMPLETED' + (isDelayed ? ' (DELAYED)' : ''), details: remark, at: nowStr }],
    };

    const isBackDated = t.freq === 'daily' && t.schedDate && today > t.schedDate && !t.parentTaskId;
    const pendingChildExists = tasks.some(x => x.parentTaskId === t.id && x.status === 'pending');
    if (isBackDated && !pendingChildExists) {
      const child = {
        id: uid(), name: t.name, dept: t.dept, freq: t.freq,
        assignedTo: [...(t.assignedTo || [])], assigneeEmails: [...(t.assigneeEmails || [])],
        time: t.time || '', schedDate: today, priority: t.priority,
        notes: t.notes || '', status: 'pending',
        doneBy: '', doneTime: '', doneRemark: '', delayReason: '', isDelayed: false,
        lastDone: '', completionHistory: [], extensions: [],
        created: today, createdBy: 'SYSTEM',
        activityLog: [{ by: 'SYSTEM', action: 'AUTO CYCLE (BACKDATE)', details: 'Freq: daily — original was ' + t.schedDate, at: nowStr }],
        parentTaskId: t.id,
      };
      const newAll = [...tasks.map(x => x.id === t.id ? updated : x), child];
      await saveSingle('hops-tasks', updated, newAll);
      await saveSingle('hops-tasks', child, newAll);
    } else {
      const newAll = tasks.map(x => x.id === t.id ? updated : x);
      await saveSingle('hops-tasks', updated, newAll);
    }
    await logAct('TASK COMPLETED', t.name);
    const emp = employees.find(e => e.name.toUpperCase() === currentUser.name.toUpperCase());
    if (emp) sendTaskCompletedEmail(t, emp);
    try { await checkPendingDeptChange(t.id); } catch (e) { console.error('Dept check failed', e); }
    setShowDone(null);
  }

  async function handleExtensionRequest({ newDate, reason }) {
    const t = showExtReq;
    const ext = {
      id: uid(),
      reqBy: currentUser.name,
      reqAt: toDay(),
      newDate,
      reason,
      status: 'pending',
      respondedBy: '',
      respondedAt: '',
    };
    const updated = {
      ...t,
      extensions: [...(t.extensions || []), ext],
      activityLog: [...(t.activityLog || []), { by: currentUser.name, action: 'EXTENSION REQUESTED', details: `New date: ${newDate} — ${reason}`, at: fDateTime() }],
    };
    await save('hops-tasks', tasks.map((x) => x.id === t.id ? updated : x));
    await logAct('EXTENSION REQUESTED', t.name);
    setShowExtReq(null);
  }

  // Sort each list: latest schedDate first, done tasks by lastDone desc
  const sortedTaskPending = [...taskPending].sort((a, b) => (b.schedDate || '').localeCompare(a.schedDate || ''));
  const sortedDelegationPending = [...delegationPending].sort((a, b) => (b.schedDate || '').localeCompare(a.schedDate || ''));
  const sortedHandoverFrom = [...handoverFromTasks].sort((a, b) => (b.schedDate || '').localeCompare(a.schedDate || ''));
  const sortedDone = [...myDone].sort((a, b) => (b.lastDone || '').localeCompare(a.lastDone || ''));

  const pagedTask = paginate(sortedTaskPending, pageTask);
  const pagedDelegation = paginate(sortedDelegationPending, pageDelegation);
  const pagedHandoverFrom = paginate(sortedHandoverFrom, pageHandoverFrom);
  const pagedHandoverTo = paginate(handoverToList, pageHandoverTo);
  const pagedDone = paginate(sortedDone, pageDone);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>My Tasks</h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => { setTab('task'); setPageTask(1); }} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, background: tab === 'task' ? '#0d7377' : '#f3f7fc', color: tab === 'task' ? 'white' : '#1a2535' }}>📋 Task ({taskPending.length})</button>
          <button onClick={() => { setTab('handover'); setPageHandoverFrom(1); setPageHandoverTo(1); }} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, background: tab === 'handover' ? '#d4920a' : '#f3f7fc', color: tab === 'handover' ? 'white' : '#1a2535' }}>🔄 Handover ({handoverCount})</button>
          <button onClick={() => { setTab('delegation'); setPageDelegation(1); }} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, background: tab === 'delegation' ? '#7c3aed' : '#f3f7fc', color: tab === 'delegation' ? 'white' : '#1a2535' }}>📤 Delegation ({delegationPending.length})</button>
          <button onClick={() => { setTab('done'); setPageDone(1); }} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, background: tab === 'done' ? '#1a7a4a' : '#f3f7fc', color: tab === 'done' ? 'white' : '#1a2535' }}>✅ Done ({myDone.length})</button>
          <button onClick={() => exportToExcel((tab === 'done' ? myDone : tab === 'delegation' ? delegationPending : taskPending).map(t => ({ Task: t.name, Department: t.dept, Frequency: t.freq, Status: t.status, 'Sched. Date': t.schedDate, 'Done By': t.doneBy, 'Done Time': t.doneTime, Delayed: t.isDelayed ? 'YES' : 'NO' })), 'my-tasks')} style={{ padding: '7px 14px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>⬇ Export</button>
          <button onClick={() => window.print()} style={{ padding: '7px 14px', borderRadius: 8, background: '#334155', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>🖨 Print</button>
        </div>
      </div>

      {tab === 'task' && (
        <div>
          {pagedTask.items.length ? pagedTask.items.map((t) => (
            <div key={t.id} style={{
              background: 'white', borderRadius: 11,
              border: '1px solid #d8e2ef', padding: '14px 16px', marginBottom: 10,
              borderLeft: `4px solid ${t.priority === 'high' ? '#c0392b' : t.priority === 'low' ? '#1a7a4a' : '#d4920a'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
                <PriorityBadge priority={t.priority} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7, alignItems: 'center' }}>
                <DeptTag name={t.dept} />
                <FreqBadge freq={t.freq} />
                {t.schedDate && <span style={{ fontSize: 11, color: '#0d7377', fontWeight: 600 }}>📅 Due: {fDate(t.schedDate)}</span>}
                {t.time && <span style={{ fontSize: 11, color: '#6b7a90' }}>⏰ {t.time}</span>}
                {t.createdBy && t.createdBy !== 'SYSTEM' && (
                  <span style={{ fontSize: 11, color: '#6b7a90', background: '#f3f7fc', padding: '2px 8px', borderRadius: 8, fontWeight: 700 }}>
                    📌 Assigned by: {t.createdBy}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 10 }}>
                <button onClick={() => setShowDone(t)} style={{ padding: '7px 16px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>✅ Mark Done</button>
              </div>
            </div>
          )) : <EmptyState icon="✅" message="NO PENDING TASKS — ALL DONE!" />}
          <Pagination {...pagedTask} onPage={(p) => setPageTask(p)} />
        </div>
      )}

      {tab === 'delegation' && (
        <div>
          {pagedDelegation.items.length ? pagedDelegation.items.map((t) => {
            const exts = t.extensions || [];
            const hasPendingExt = exts.some((x) => x.status === 'pending');
            const canRequestExt = exts.length < 3 && !hasPendingExt;
            const givenAwayInfo = handedOverByMe[t.id];
            const isActivelyGivenAway = activelyHandedOverIds.has(t.id);
            return (
              <div key={t.id} style={{ background: 'white', borderRadius: 11, border: '1px solid #f5c842', padding: '14px 16px', marginBottom: 10, borderLeft: '4px solid #d4920a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                    <PriorityBadge priority={t.priority} />
                    <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>📤 DELEGATION</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7, alignItems: 'center' }}>
                  <DeptTag name={t.dept} />
                  {t.schedDate && <span style={{ fontSize: 11, color: '#c0392b', fontWeight: 700 }}>📅 Due: {fDate(t.schedDate)}</span>}
                  {t.createdBy && t.createdBy !== 'SYSTEM' && <span style={{ fontSize: 11, color: '#6b7a90', background: '#f3f7fc', padding: '2px 8px', borderRadius: 8, fontWeight: 700 }}>📌 Assigned by: {t.createdBy}</span>}
                </div>
                {exts.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, background: '#f8fbff', border: '1px solid #d8e2ef', borderRadius: 7, padding: '7px 10px' }}>
                    <div style={{ fontWeight: 800, color: '#6b7a90', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4, fontSize: 10 }}>Extension History ({exts.length}/3)</div>
                    {exts.map((x, i) => (
                      <div key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 10, background: x.status === 'pending' ? '#fef3c7' : x.status === 'approved' ? '#d4edda' : '#fde8e8', color: x.status === 'pending' ? '#92400e' : x.status === 'approved' ? '#155724' : '#7d1a1a' }}>
                          {x.status === 'pending' ? '⏳' : x.status === 'approved' ? '✅' : '❌'} #{i + 1}
                        </span>
                        <span style={{ color: '#6b7a90', fontSize: 11 }}>New date: <strong style={{ color: '#0d7377' }}>{fDate(x.newDate)}</strong></span>
                        {x.status !== 'pending' && <span style={{ color: '#6b7a90', fontSize: 10 }}>({x.status} by {x.respondedBy})</span>}
                      </div>
                    ))}
                    {hasPendingExt && <div style={{ marginTop: 5, fontSize: 11, color: '#92400e', fontWeight: 700 }}>⏳ Extension approval pending from admin</div>}
                  </div>
                )}
                <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {isActivelyGivenAway ? (
                    <span style={{ padding: '7px 14px', borderRadius: 8, background: '#fef3c7', color: '#92400e', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      🔒 Handover Active — {givenAwayInfo?.toName} will complete this
                    </span>
                  ) : (
                    <button onClick={() => setShowDone(t)} style={{ padding: '7px 16px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>✅ Mark Done</button>
                  )}
                  {canRequestExt ? (
                    <button onClick={() => setShowExtReq(t)} style={{ padding: '7px 16px', borderRadius: 8, background: '#d4920a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>
                      🔄 Request Extension ({3 - exts.length} left)
                    </button>
                  ) : hasPendingExt ? (
                    <span style={{ padding: '7px 12px', borderRadius: 8, background: '#fef3c7', color: '#92400e', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>⏳ Extension Pending Approval</span>
                  ) : exts.length >= 3 ? (
                    <span style={{ padding: '7px 12px', borderRadius: 8, background: '#fde8e8', color: '#7d1a1a', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>🚫 Max 3 Extensions Reached</span>
                  ) : null}
                </div>
              </div>
            );
          }) : <EmptyState icon="📤" message="NO PENDING DELEGATIONS" />}
          <Pagination {...pagedDelegation} onPage={(p) => setPageDelegation(p)} />
        </div>
      )}

      {tab === 'done' && (
        <div>
          {pagedDone.items.length ? pagedDone.items.map((t) => {
            const delayed = wasCompletedLate(t);
            const isDelegation = t.freq === 'delegation';
            // Handover TO me (I completed someone else's task)
            const hoverToMe = getAnyHandoverToMe(t.id);
            // Handover FROM me (someone else completed my task)
            const hoverFromMe = !hoverToMe ? getHandoverFromMe(t.id) : null;
            const exts = t.extensions || [];
            return (
              <div key={t.id} style={{ background: 'white', borderRadius: 11, border: '1px solid #d8e2ef', padding: '14px 16px', marginBottom: 10, borderLeft: `4px solid ${delayed ? '#6d28d9' : '#1a7a4a'}`, opacity: 0.85 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <PriorityBadge priority={t.priority} />
                    {isDelegation && <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>📤 DELEGATION</span>}
                    {hoverToMe && <span style={{ background: '#d4edda', color: '#155724', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>🔄 HANDOVER from {hoverToMe.fromName}</span>}
                    {hoverFromMe && <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>🔄 HANDOVER to {hoverFromMe.toName}</span>}
                    {delayed
                      ? <span style={{ background: '#ede9fe', color: '#4c1d95', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>⏰ DELAYED</span>
                      : <span style={{ background: '#d4edda', color: '#155724', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>✅ ON TIME</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7, alignItems: 'center' }}>
                  <DeptTag name={t.dept} />
                  {!isDelegation && <FreqBadge freq={t.freq} />}
                  {t.schedDate && <span style={{ fontSize: 11, color: '#0d7377' }}>📅 {fDate(t.schedDate)}</span>}
                  {t.createdBy && t.createdBy !== 'SYSTEM' && <span style={{ fontSize: 11, color: '#6b7a90', background: '#f3f7fc', padding: '2px 8px', borderRadius: 8, fontWeight: 700 }}>📌 Assigned by: {t.createdBy}</span>}
                </div>
                {/* Handover chain info strip */}
                {hoverToMe && (
                  <div style={{ marginTop: 8, fontSize: 11.5, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 7, padding: '7px 11px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>📥 Assigned to <strong>{hoverToMe.fromName}</strong> by <strong>{t.createdBy && t.createdBy !== 'SYSTEM' ? t.createdBy : '—'}</strong></span>
                    <span>→ <strong>{hoverToMe.fromName}</strong> handed over to you</span>
                    <span style={{ color: '#6b7a90' }}>📅 {fDate(hoverToMe.dateStart)} → {fDate(hoverToMe.dateEnd)}</span>
                  </div>
                )}
                {hoverFromMe && (
                  <div style={{ marginTop: 8, fontSize: 11.5, background: '#fffbeb', border: '1px solid #f5c842', borderRadius: 7, padding: '7px 11px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>📤 You handed over to <strong>{hoverFromMe.toName}</strong></span>
                    <span>→ <strong>{t.doneBy}</strong> completed this</span>
                    <span style={{ color: '#6b7a90' }}>📅 {fDate(hoverFromMe.dateStart)} → {fDate(hoverFromMe.dateEnd)}</span>
                  </div>
                )}
                {isDelegation && exts.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 7, padding: '7px 10px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span>📌 Assigned: <strong>{fDate(t.created)}</strong></span>
                    <span>🔄 Extensions: <strong>{exts.length}</strong></span>
                  </div>
                )}
                <div style={{ marginTop: 8, fontSize: 12, background: delayed ? '#faf5ff' : '#d4edda', padding: '8px 11px', borderRadius: 7 }}>
                  ✅ Done by <strong>{t.doneBy}</strong>{t.lastDone ? ' on ' + fDate(t.lastDone) : ''}
                  {hoverToMe && t.doneBy !== currentUser.name && <span style={{ color: '#155724', fontWeight: 700 }}> (via Handover)</span>}
                  {delayed && t.delayReason && <div style={{ color: '#6d28d9', marginTop: 4 }}>⏰ {t.delayReason}</div>}
                </div>
              </div>
            );
          }) : <EmptyState icon="📋" message="NO TASKS FOUND" />}
          <Pagination {...pagedDone} onPage={(p) => setPageDone(p)} />
        </div>
      )}

      {tab === 'handover' && (
        <div>
          {/* Handover From — tasks received by me */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: '#0b1e3d', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              📥 Handover From — Received by Me
              <span style={{ background: '#1a7a4a', color: 'white', borderRadius: 20, fontSize: 10, fontWeight: 800, padding: '2px 8px' }}>{handoverFromTasks.length}</span>
            </div>
            {pagedHandoverFrom.items.length ? pagedHandoverFrom.items.map((t) => {
              const handoverInfo = getHandoverInfo(t.id);
              return (
                <div key={t.id} style={{ background: '#f0fdf4', borderRadius: 11, border: '1px solid #86efac', padding: '14px 16px', marginBottom: 10, borderLeft: '4px solid #1a7a4a' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
                    <PriorityBadge priority={t.priority} />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7, alignItems: 'center' }}>
                    <DeptTag name={t.dept} />
                    {t.schedDate && <span style={{ fontSize: 11, color: '#0d7377', fontWeight: 600 }}>📅 Due: {fDate(t.schedDate)}</span>}
                    {t.createdBy && t.createdBy !== 'SYSTEM' && <span style={{ fontSize: 11, color: '#6b7a90', background: '#f3f7fc', padding: '2px 8px', borderRadius: 8, fontWeight: 700 }}>📌 Assigned by: {t.createdBy}</span>}
                  </div>
                  {handoverInfo && (
                    <div style={{ marginTop: 8, fontSize: 11.5, background: 'white', border: '1px solid #86efac', borderRadius: 7, padding: '7px 11px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span>🔄 From: <strong>{handoverInfo.fromName}</strong></span>
                      <span>📅 Valid: {fDate(handoverInfo.dateStart)} → {fDate(handoverInfo.dateEnd)}</span>
                      {handoverInfo.reason && <span>📝 {handoverInfo.reason}</span>}
                    </div>
                  )}
                  <div style={{ marginTop: 10 }}>
                    <button onClick={() => setShowDone(t)} style={{ padding: '7px 16px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>✅ Mark Done</button>
                  </div>
                </div>
              );
            }) : <div style={{ background: 'white', borderRadius: 10, border: '1px solid #d8e2ef', padding: '20px', textAlign: 'center', color: '#6b7a90', fontSize: 13 }}>📭 No handovers received yet</div>}
            <Pagination {...pagedHandoverFrom} onPage={(p) => setPageHandoverFrom(p)} />
          </div>

          {/* Handover To — tasks given by me */}
          <div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: '#0b1e3d', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              📤 Handover To — Given by Me
              <span style={{ background: '#d4920a', color: 'white', borderRadius: 20, fontSize: 10, fontWeight: 800, padding: '2px 8px' }}>{handoverToList.length}</span>
            </div>
            {pagedHandoverTo.items.length ? pagedHandoverTo.items.map((h) => {
              const STATUS_CFG = {
                pending:  { bg: '#fff3cd', color: '#7a4800', label: '⏳ PENDING' },
                accepted: { bg: '#d4edda', color: '#155724', label: '✅ ACCEPTED' },
                rejected: { bg: '#fde8e8', color: '#c0392b', label: '❌ REJECTED' },
                cancelled:{ bg: '#f3f7fc', color: '#6b7a90', label: '🚫 CANCELLED' },
              };
              const sc = STATUS_CFG[h.status] || STATUS_CFG.pending;
              const hTasks = tasks.filter(t => (h.taskIds || []).includes(t.id));
              return (
                <div key={h.id} style={{ background: '#fffbeb', borderRadius: 11, border: '1px solid #f5c842', padding: '14px 16px', marginBottom: 10, borderLeft: '4px solid #d4920a' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>To: <span style={{ color: '#0d7377' }}>{h.toName}</span></div>
                    <span style={{ background: sc.bg, color: sc.color, padding: '3px 10px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>{sc.label}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11.5, color: '#6b7a90', marginBottom: 8 }}>
                    <span>📅 {fDate(h.dateStart)} → {fDate(h.dateEnd)}</span>
                    {h.dept && <span>🏢 {h.dept}</span>}
                    {h.reason && <span>📝 {h.reason}</span>}
                  </div>
                  {hTasks.length > 0 && (
                    <div style={{ background: 'white', border: '1px solid #f5c842', borderRadius: 7, padding: '7px 10px' }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>Tasks ({hTasks.length})</div>
                      {hTasks.map(t => (
                        <div key={t.id} style={{ fontSize: 12, color: '#1a2535', padding: '3px 0', borderBottom: '1px solid #f3f7fc', display: 'flex', justifyContent: 'space-between' }}>
                          <span>• {t.name}</span>
                          <span style={{ fontSize: 10.5, color: t.status === 'done' ? '#1a7a4a' : '#d4920a', fontWeight: 700 }}>{t.status === 'done' ? '✅ Done' : '⏳ Pending'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }) : <div style={{ background: 'white', borderRadius: 10, border: '1px solid #d8e2ef', padding: '20px', textAlign: 'center', color: '#6b7a90', fontSize: 13 }}>📭 No handovers given yet</div>}
            <Pagination {...pagedHandoverTo} onPage={(p) => setPageHandoverTo(p)} />
          </div>
        </div>
      )}

      <DoneModal task={showDone} open={!!showDone} onClose={() => setShowDone(null)} onSubmit={handleDone} />
      <ExtensionRequestModal task={showExtReq} open={!!showExtReq} onClose={() => setShowExtReq(null)} onSubmit={handleExtensionRequest} />
    </div>
  );
}
