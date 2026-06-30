import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { uid, toDay, fDate, fDateTime, wasCompletedLate, parseTimeToMinutes, isAssignedTo, isTaskDueToday, notifyAdmins, exportToExcel, getNextScheduledDate } from '../utils';
import { FREQ_LABELS, FREQ_OPTIONS, PRIORITY_OPTIONS } from '../constants';
import { DeptTag, PriorityBadge, FreqBadge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { TaskDetailModal } from '../components/common/TaskDetailModal';
import { Alert, EmptyState } from '../components/common/Alert';
import { DateRangeExportModal } from '../components/common/DateRangeExportModal';
import { Pagination, paginate } from '../components/common/Pagination';
import { sendTaskAssignedEmail } from '../lib/emailService';

// ─── Mark Done Modal ──────────────────────────────────────────────────────────
function DoneModal({ task, open, onClose, onSubmit, currentUser }) {
  const [remark, setRemark] = useState('');
  const [delayReason, setDelayReason] = useState('');
  const now = new Date();
  const nowStr = now.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });

  // Delayed if completing AFTER the scheduled deadline — by date (schedDate
  // already passed) OR by time (same day, after the scheduled time). Mirrors
  // the MyTasks.jsx DoneModal so the `isDelayed` flag stored in the DB is
  // consistent regardless of which page the user marked the task done from.
  // The previous time-only check flagged a task as on-time even when the
  // admin completed a 3-day-old task in the morning, because today's
  // wall-clock time was earlier than the scheduled hour.
  const isDelayed = task ? (() => {
    const isDateOverdue = task.schedDate ? toDay() > task.schedDate : false;
    const sm = parseTimeToMinutes(task.time);
    if (!sm) return isDateOverdue;
    const isTimeOverdue = now.getHours() * 60 + now.getMinutes() > sm;
    return isDateOverdue || isTimeOverdue;
  })() : false;

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
        <div>
          <Alert variant="orange">⏰ <strong>Task is DELAYED!</strong> Please provide a delay reason.</Alert>
          <Field label="Delay Reason * (MANDATORY)">
            <textarea value={delayReason} onChange={(e) => setDelayReason(e.target.value)} placeholder="EXPLAIN WHY THE TASK WAS NOT COMPLETED ON TIME..." style={{ ...IS, minHeight: 80, resize: 'vertical' }} />
          </Field>
        </div>
      )}
      <Field label="Remark (Optional)">
        <textarea value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="ANY NOTES..." style={{ ...IS, minHeight: 55, resize: 'vertical' }} />
      </Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid #d8e2ef' }}>
        <button onClick={handleSubmit} style={{ ...BtnS, background: '#1a7a4a' }}>✅ Yes, Task Complete!</button>
        <button onClick={onClose} style={{ ...BtnS, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377' }}>Cancel</button>
      </div>
    </Modal>
  );
}

// ─── Task Form Modal ────────────────────────────────────────────────────────
function TaskFormModal({ open, onClose, onSave, editTask, depts, employees }) {
  // Default schedDate to today so admin-assigned tasks appear in My Tasks
  // immediately (the MyTasks filter gates on schedDate <= today). Admins
  // can override by picking a different date in the date picker. We compute
  // today's date fresh inside makeBlank() so an app left open past midnight
  // gets the correct "today" the next time admin opens the form.
  function makeBlank() {
    return { name: '', dept: '', freq: 'daily', assignedTo: [], assigneeEmails: [], schedDate: toDay(), time: '', priority: 'medium', notes: '' };
  }
  const [form, setForm] = useState(makeBlank);

  function reset(t) {
    setForm(t ? {
      name: t.name, dept: t.dept, freq: t.freq,
      assignedTo: t.assignedTo || [], assigneeEmails: t.assigneeEmails || [],
      // For edits: keep the existing schedDate (don't overwrite with today
      // unless the original was empty — that would silently change the
      // scheduled date every time admin opened an old task to edit).
      schedDate: t.schedDate || (t.parentTaskId ? '' : toDay()), time: t.time || '',
      priority: t.priority, notes: t.notes || '',
    } : makeBlank());
  }

  // Reset form when modal opens/closes or edit task changes.
  // Must be in useEffect — a render-phase setState here would wipe the
  // user's typing every time form.name briefly differs from editTask.name.
  useEffect(() => {
    if (open && editTask) reset(editTask);
    if (!open) reset(null);
  }, [open, editTask]);

  function toggleAssignee(emp) {
    const idx = form.assignedTo.indexOf(emp.name);
    if (idx >= 0) {
      setForm((f) => ({ ...f, assignedTo: f.assignedTo.filter((_, i) => i !== idx), assigneeEmails: f.assigneeEmails.filter((_, i) => i !== idx) }));
    } else {
      setForm((f) => ({ ...f, assignedTo: [...f.assignedTo, emp.name], assigneeEmails: [...f.assigneeEmails, emp.email || ''] }));
    }
  }

  function handleSave() {
    if (!form.name.trim()) { alert('Task name required!'); return; }
    if (!form.dept) { alert('Department required!'); return; }
    if (!form.assignedTo.length) { alert('Assign to at least one person!'); return; }
    onSave(form);
    reset(null);
  }

  const deptEmps = form.dept ? employees.filter((e) => e.dept === form.dept) : [];

  return (
    <Modal open={open} onClose={() => { onClose(); reset(null); }} title={editTask ? 'Edit Task' : 'New Task'}>
      {/* Task Name */}
      <Field label="Task Name *">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toUpperCase() })} placeholder="E.G. WATER THE PLANTS" style={IS} autoFocus />
      </Field>

      {/* Dept + Freq row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Department *">
          <select value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value, assignedTo: [], assigneeEmails: [] })} style={IS}>
            <option value="">Select department...</option>
            {depts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Frequency">
          <select value={form.freq} onChange={(e) => setForm({ ...form, freq: e.target.value })} style={IS}>
            {FREQ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      </div>

      {/* Assign To */}
      <Field label="Assign To *">
        {!form.dept ? (
          <div style={{ border: '1.5px dashed #d8e2ef', borderRadius: 8, padding: '14px', background: '#f8fbff', textAlign: 'center', color: '#6b7a90', fontSize: 13 }}>
            👆 Select a department first to see employees
          </div>
        ) : deptEmps.length === 0 ? (
          <div style={{ border: '1.5px dashed #d8e2ef', borderRadius: 8, padding: '14px', background: '#f8fbff', textAlign: 'center', color: '#6b7a90', fontSize: 13 }}>
            No employees in this department. Add employees first.
          </div>
        ) : (
          <div style={{ border: '1.5px solid #d8e2ef', borderRadius: 8, padding: '8px 10px', background: 'white', maxHeight: 160, overflowY: 'auto' }}>
            {deptEmps.map((e) => (
              <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 6px', fontSize: 13, cursor: 'pointer', borderRadius: 6, background: form.assignedTo.includes(e.name) ? '#e8f8ef' : 'transparent', marginBottom: 2, transition: 'background 0.15s' }}>
                <input type="checkbox" checked={form.assignedTo.includes(e.name)} onChange={() => toggleAssignee(e)} style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#0d7377' }} />
                <span style={{ fontWeight: form.assignedTo.includes(e.name) ? 800 : 600, color: form.assignedTo.includes(e.name) ? '#0d7377' : '#1a2535' }}>{e.name}</span>
                {e.role && <span style={{ fontSize: 10.5, color: '#6b7a90', marginLeft: 'auto' }}>{e.role}</span>}
              </label>
            ))}
          </div>
        )}
      </Field>

      {/* Date + Time row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="📅 Scheduled Date">
          <input type="date" value={form.schedDate} onChange={(e) => setForm({ ...form, schedDate: e.target.value })} style={IS} />
        </Field>
        <Field label="⏰ Time (24hr)">
          <input
            type="time"
            value={form.time}
            onChange={(e) => setForm({ ...form, time: e.target.value })}
            style={IS}
          />
        </Field>
      </div>

      {/* Priority */}
      <Field label="Priority">
        <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} style={IS}>
          {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>

      {/* Notes */}
      <Field label="Notes (Optional)">
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Extra instructions or details..." style={{ ...IS, minHeight: 70, resize: 'vertical' }} />
      </Field>

      <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid #d8e2ef' }}>
        <button onClick={handleSave} style={{ ...BtnS, background: '#0d7377' }}>{editTask ? '💾 Save Edit' : '💾 Save Task'}</button>
        <button onClick={() => { onClose(); reset(null); }} style={{ ...BtnS, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377' }}>Cancel</button>
      </div>
    </Modal>
  );
}

const IS = { width: '100%', padding: '9px 13px', borderRadius: 8, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 13, color: '#1a2535', outline: 'none', background: 'white', fontWeight: 600 };
const BtnS = { padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13, color: 'white', fontFamily: "'Nunito',sans-serif" };
function Field({ label, children }) {
  return <div style={{ marginBottom: 13 }}><label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</label>{children}</div>;
}

// ─── Extension Approval Modal (Admin) ────────────────────────────────────────
function ExtensionApprovalModal({ task, open, onClose, onDecide, currentUser }) {
  if (!task) return null;
  const exts = task.extensions || [];
  return (
    <Modal open={open} onClose={onClose} title={`📤 Extension Requests — ${task.name}`} maxWidth="max-w-lg">
      <div style={{ marginBottom: 12, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5 }}>
        <span style={{ color: '#6b7a90' }}>📅 Assigned: <strong style={{ color: '#0d7377' }}>{task.schedDate ? fDate(task.schedDate) : '—'}</strong></span>
        <span style={{ color: '#6b7a90' }}>🔄 Total Extensions: <strong>{exts.length}/3</strong></span>
        {task.status === 'done' && <span style={{ color: '#6b7a90' }}>✅ Completed: <strong style={{ color: '#1a7a4a' }}>{task.lastDone ? fDate(task.lastDone) : '—'}</strong></span>}
      </div>
      {exts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px', color: '#6b7a90', fontSize: 13, background: '#f8fbff', borderRadius: 8 }}>No extension requests yet</div>
      ) : exts.map((x, i) => (
        <div key={x.id} style={{ background: x.status === 'pending' ? '#fffbeb' : x.status === 'approved' ? '#f0fdf4' : '#fff5f5', border: `1.5px solid ${x.status === 'pending' ? '#f5c842' : x.status === 'approved' ? '#86efac' : '#fca5a5'}`, borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.5 }}>Extension #{i + 1}</span>
            <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 20, background: x.status === 'pending' ? '#fef3c7' : x.status === 'approved' ? '#d4edda' : '#fde8e8', color: x.status === 'pending' ? '#92400e' : x.status === 'approved' ? '#155724' : '#7d1a1a' }}>
              {x.status === 'pending' ? '⏳ PENDING' : x.status === 'approved' ? '✅ APPROVED' : '❌ REJECTED'}
            </span>
          </div>
          <div style={{ fontSize: 12.5, marginBottom: 3 }}>👤 <strong>{x.reqBy}</strong> — requested on {fDate(x.reqAt)}</div>
          <div style={{ fontSize: 12.5, marginBottom: 4 }}>📅 New Due Date Requested: <strong style={{ color: '#0d7377' }}>{fDate(x.newDate)}</strong></div>
          {x.reason && <div style={{ fontSize: 12, color: '#4a5568', background: 'rgba(255,255,255,0.8)', padding: '7px 10px', borderRadius: 6, marginBottom: 8, fontStyle: 'italic' }}>"{x.reason}"</div>}
          {x.status !== 'pending' && x.respondedBy && (
            <div style={{ fontSize: 11, color: '#6b7a90', marginTop: 4 }}>
              {x.status === 'approved' ? '✅ Approved' : '❌ Rejected'} by <strong>{x.respondedBy}</strong> on {fDate(x.respondedAt)}
            </div>
          )}
          {x.status === 'pending' && (() => {
            const isAssigner = currentUser.name === task.createdBy || currentRole === 'mainadmin';
            const isSelfRequest = x.reqBy === currentUser.name;
            if (!isAssigner) return <div style={{ fontSize: 11, color: '#6b7a90', marginTop: 6, fontStyle: 'italic' }}>Only the task assigner ({task.createdBy}) can approve this</div>;
            if (isSelfRequest) return <div style={{ fontSize: 11, color: '#c0392b', marginTop: 6, fontWeight: 700 }}>🚫 You cannot approve your own extension request</div>;
            return (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => onDecide(task, x.id, 'approved', currentUser.name)} style={{ padding: '6px 14px', borderRadius: 7, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>✅ Approve Extension</button>
                <button onClick={() => onDecide(task, x.id, 'rejected', currentUser.name)} style={{ padding: '6px 14px', borderRadius: 7, background: '#c0392b', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>❌ Reject</button>
              </div>
            );
          })()}
        </div>
      ))}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #d8e2ef' }}>
        <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>Close</button>
      </div>
    </Modal>
  );
}

// ─── Auto-sync: delegation task ↔ delegation record ──────────────────────────
// A task with `freq === 'delegation'` represents delegation work. To keep the
// Delegation Tracker page (`Delegations.jsx`) and the dashboard drill-down
// popup in lockstep with this view, every create/edit/complete/delete of a
// delegation task also mirrors a corresponding row into `workdesk-delegations`.
//
// Both writes use the SAME id (task.id === delegation.id) so a later delete
// or status update can find and patch the counterpart without a separate
// mapping table. Sync is one-way (Tasks → Delegations); edits made on the
// Delegation Tracker page do NOT flow back to the task.

// Map a task object to the shape Delegations.jsx writes for delegation records.
function taskToDelegation(task) {
  if (!task) return null;
  const status = task.status === 'done' ? 'done' : 'pending';
  return {
    id: task.id,
    task: task.name || '',
    taskName: task.name || '',
    doerId: '',
    // Primary doer — tasks can have multiple assignees but a delegation record
    // tracks one. We use the first assignee; if there are several, the join
    // still surfaces them in the Delegation Tracker UI as "Task" with the
    // assignee list visible in Manage Tasks.
    doerName: (task.assignedTo || [])[0] || '',
    dept: task.dept || '',
    priority: task.priority || 'medium',
    dueDate: task.schedDate || '',
    expDate: task.schedDate || '',
    remarks: task.notes || '',
    notes: task.notes || '',
    status,
    createdBy: task.createdBy || '',
    createdAt: task.created || toDay(),
    actualDate: task.lastDone || '',
    actualTime: task.doneTime || '',
    doneRemark: task.doneRemark || '',
    delayReason: task.delayReason || '',
    isDelayed: !!task.isDelayed,
    // Shape kept minimal — full extension shape is built by Delegations.jsx
    // when an employee requests an extension from the workflow side.
    extensionRequests: [],
    updatedAt: new Date().toISOString(),
  };
}

// Sync a single task. Returns the new `delegations` array. Caller is
// responsible for `save()`-ing the array; this function does it for the
// happy path so it's a one-liner at the call site. When the task is being
// removed (or its freq was changed away from 'delegation'), the matching
// record is moved to trash instead of being saved.
async function syncDelegationFromTask(task, delegations, { save, moveToTrash }, opts = {}) {
  const { isDeleted = false, freqChanged = false } = opts;

  // Task is not a delegation task anymore — drop the mirror if it exists.
  if (!task || task.freq !== 'delegation' || freqChanged) {
    if (isDeleted || freqChanged) {
      const existing = delegations.find((d) => d.id === (task && task.id));
      if (existing) {
        try { await moveToTrash('delegation', existing.id); } catch (e) { /* non-fatal */ }
        return delegations.filter((d) => d.id !== existing.id);
      }
    }
    return delegations;
  }

  const mirror = taskToDelegation(task);
  const idx = delegations.findIndex((d) => d.id === task.id);
  const next = idx >= 0
    ? delegations.map((d, i) => i === idx ? mirror : d)
    : [...delegations, mirror];
  try { await save('workdesk-delegations', next); } catch (e) { console.error('syncDelegationFromTask save failed:', e); }
  return next;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Tasks() {
  const { currentRole, currentUser, hasPerm } = useAuth();
  const { tasks, delegations, depts, employees, notices, save, logAct, moveToTrash } = useApp();
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  // Date filter — three preset options (current month / last 30 days / all)
  // and an optional custom range that the user can fill in regardless of
  // the preset. Custom range is applied on top of (or instead of) the
  // preset; if preset is 'custom', only from/to are used.
  const [filterDatePreset, setFilterDatePreset] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  // Employee filter — only meaningful once a department is selected,
  // because employees are scoped by department.
  const [filterEmployee, setFilterEmployee] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [showDetail, setShowDetail] = useState(null);
  // ?focus=<taskId> — set by the dashboard drilldown's "Open in Manage Tasks"
  // button. On mount, look up the matching task and open its detail modal,
  // then strip the param so a refresh doesn't re-open it. Handles the case
  // where the task has been deleted between drilldown and navigation by
  // silently doing nothing (the param is still stripped).
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get('focus');
  useEffect(() => {
    if (!focusId) return;
    const found = tasks.find((t) => t.id === focusId);
    if (found) setShowDetail(found);
    setSearchParams((prev) => { prev.delete('focus'); return prev; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, tasks]);
  const [showDone, setShowDone] = useState(null);
  const [showExtApproval, setShowExtApproval] = useState(null);
  const [tab, setTab] = useState('ongoing');
  const [showExport, setShowExport] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Filter sheet state. The same compact "🔍 Filters (N)" button is now
  // used for all viewports — a single click opens a sheet on mobile and a
  // centered modal on desktop, both driven by the same state. We track
  // active filter count so the toggle button can show "Filters (2)" and
  // the user knows they have filters applied even with the sheet closed.
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const clearAllFilters = useCallback(() => {
    setSearch(''); setFilterDept(''); setFilterEmployee('');
    setFilterDatePreset(''); setFilterDateFrom(''); setFilterDateTo('');
  }, []);
  // Count active filter "pills" so the toolbar button can show "(N)" and
  // the user knows filters are applied even with the sheet closed.
  // Each date preset OR a custom range counts as one filter pill (whichever
  // is active); both being set would be redundant so we only count once.
  const activeFilterCount = (search ? 1 : 0)
    + (filterDept ? 1 : 0) + (filterEmployee ? 1 : 0)
    + ((filterDatePreset && filterDatePreset !== 'custom') || (filterDatePreset === 'custom' && (filterDateFrom || filterDateTo)) ? 1 : 0);

  // Lock body scroll while the mobile sheet is open so the page behind
  // doesn't scroll when the user drags inside the sheet. Mirrors the
  // pattern used by src/components/common/Modal.jsx.
  useEffect(() => {
    if (mobileSheetOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileSheetOpen]);

  // Reset multi-select when user switches tabs so they don't accidentally
  // bulk-delete across tab boundaries (e.g. selections from "Mine" leaking
  // into the "All" tab where the same id may have different permission).
  useEffect(() => {
    setSelectedIds(new Set());
  }, [tab]);

  const isMain = currentRole === 'mainadmin';
  const canAdd = isMain || hasPerm('tasks_add');
  const canEdit = isMain || hasPerm('tasks_edit');
  const canDel = isMain || hasPerm('tasks_delete');

  // My Tasks = tasks assigned to me OR created by me
  const myTasks = tasks.filter((t) =>
    isAssignedTo(t, currentUser.name) || t.createdBy === currentUser.name
  );

  // Source list depends on tab + permissions
  // Main admin sees everything. Employees always see only their own tasks,
  // even on the "All" tab — the "All" tab label just means "all of MY tasks",
  // not "all tasks in the system". all_task_details permission is intentionally
  // NOT used here so an employee never sees another employee's task data.
  const sourceList = isMain ? tasks : myTasks;

  // ─── Ongoing vs Upcoming classification ────────────────────────────────────
  // Splits tasks into two date-based buckets:
  //   ongoing  → active right now: daily/delegation with schedDate <= today,
  //              or periodic (15-day, monthly, …) where today matches the
  //              periodic date per isTaskDueToday().
  //   upcoming → not yet due: daily/delegation with schedDate in the future,
  //              or periodic off-period.
  //
  // Status (pending/done) is NOT part of classifyTask's decision — the
  // date split is purely date-based. The TAB CONTENT still includes both
  // statuses (combine with the Status dropdown to narrow), but the COUNT
  // BADGES on the tab labels are pending-only so the badge answers
  // "how many do I still need to do?" rather than "how many total are
  // scheduled?". Done counts are surfaced via the Status dropdown filter
  // (pick DONE to see them) and the MIS Reporting / Activity Log pages
  // for historical reporting.
  const todayStr = toDay();
  // Terminal statuses — the task is closed out and lives in the 'done' bucket
  // alongside completed tasks. Critically, cancelled/rejected/trashed tasks
  // MUST NOT be classified as 'upcoming' (which would keep them visible in
  // the Upcoming tab even though they're closed). The dept-change flow marks
  // upcoming tasks as 'cancelled'; without this they'd haunt the queue.
  const TERMINAL_STATUSES = ['done', 'cancelled', 'rejected', 'trashed'];
  function classifyTask(t) {
    const freq = t.freq || 'daily';
    const sched = t.schedDate || '';
    if (TERMINAL_STATUSES.includes(t.status)) return 'done';
    // Daily + delegation are conceptually due every day. The actual schedDate
    // tells us whether the current slot has arrived (ongoing) or sits in the
    // future (upcoming).
    if (freq === 'daily' || freq === 'delegation') {
      if (!sched) return 'ongoing'; // backstop: no date = treat as active
      return sched <= todayStr ? 'ongoing' : 'upcoming';
    }
    // Periodic freqs — anchor on the original schedDate and check whether
    // today matches the cycle. If yes, the slot is live (ongoing); if no,
    // the slot is in the future / off-period (upcoming).
    return isTaskDueToday(t) ? 'ongoing' : 'upcoming';
  }
  // Counts reflect the actionable queue for each tab:
  //   ongoing  → current-date pending tasks (no done — done lives in its
  //              own tab so the badge answers "how many do I still need
  //              to do today?")
  //   upcoming → future-dated pending tasks
  //   done     → completed tasks (the historical record)
  //
  // Done counts come through the Status dropdown filter (pick DONE on the
  // Ongoing/Upcoming tab) and the MIS Reporting / Activity Log pages for
  // historical reporting, but the badge on the Done tab is the canonical
  // "how many have been completed" number.
  const ongoingCount = sourceList.filter((t) => t.status === 'pending' && classifyTask(t) === 'ongoing').length;
  const upcomingCount = sourceList.filter((t) => t.status === 'pending' && classifyTask(t) === 'upcoming').length;
  const doneCount = sourceList.filter((t) => TERMINAL_STATUSES.includes(t.status)).length;

  // Resolve the user's date filter into an actual [from, to] window.
  // `todayStr` is the current day; preset picks a relative window;
  // 'custom' falls through to whatever from/to the user typed.
  // Returns [null, null] when no date filter is active (so the caller
  // can skip the comparison entirely).
  function dateRangeFromPreset() {
    if (filterDatePreset === 'thisMonth') {
      const d = new Date(todayStr + 'T00:00:00');
      const y = d.getFullYear(); const m = d.getMonth();
      const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      // Last day of current month — day 0 of next month = last of this
      const to = new Date(y, m + 1, 0);
      const toStr = `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, '0')}-${String(to.getDate()).padStart(2, '0')}`;
      return [from, toStr];
    }
    if (filterDatePreset === 'last30') {
      const d = new Date(todayStr + 'T00:00:00');
      d.setDate(d.getDate() - 30);
      const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return [from, todayStr];
    }
    if (filterDatePreset === 'custom') {
      return [filterDateFrom || null, filterDateTo || null];
    }
    return [null, null];
  }
  const [dateFrom, dateTo] = dateRangeFromPreset();

  const rawFiltered = sourceList.filter((t) => {
    // Tab classification is the primary filter — splits the list into
    // ongoing (current-date pending) vs upcoming (future-dated pending)
    // vs done (completed). Once classified into a tab, the date filter
    // narrows further (e.g. Ongoing + Current Month).
    const cls = classifyTask(t);
    // Defence-in-depth: never surface a terminal-status task in Ongoing
    // or Upcoming even if classifyTask ever drifts. After the dept-change
    // Accept flow runs, this guarantees cancelled future-dated tasks
    // (which now classify as 'done') cannot leak into Upcoming via any
    // secondary filter below. Specifically: the user's complaint was that
    // after accepting a dept change, future-dated tasks still appeared in
    // the Upcoming tab. The cancellation flips status to 'cancelled' but
    // we want absolute certainty they never re-appear in actionable tabs.
    //
    // NOTE: `isDoneTab` (declared below) cannot be referenced here — JS
    // const has no hoisted-initialised semantics and a TDZ ReferenceError
    // would blank the page. Inline the comparison instead.
    if (tab !== 'done' && TERMINAL_STATUSES.includes(t.status)) return false;
    // Primary gate per tab. Cancelled tasks classify as 'done' (above), so
    // these checks exclude them from Upcoming/Ongoing naturally; the
    // terminal-status guard above is belt-and-suspenders.
    if (tab === 'ongoing' && cls !== 'ongoing') return false;
    if (tab === 'upcoming' && cls !== 'upcoming') return false;
    if (tab === 'done' && cls !== 'done') return false;
    if (search && !t.name.toUpperCase().includes(search.toUpperCase()) && !t.dept.toUpperCase().includes(search.toUpperCase())) return false;
    if (filterDept && t.dept !== filterDept) return false;
    // Employee filter — match against assignedTo[] (case-insensitive).
    // Empty filterDept means "all depts" but we still let the user
    // narrow by a single employee if they want; that's a useful shortcut.
    if (filterEmployee && !(t.assignedTo || []).some((a) => a.toUpperCase() === filterEmployee.toUpperCase())) return false;
    // Date filter — applied to schedDate (the field shown in the Sched.
    // Date column). Tasks with no schedDate are skipped when a date
    // window is active, otherwise they'd show through inconsistently.
    if (dateFrom && (!t.schedDate || t.schedDate < dateFrom)) return false;
    if (dateTo && (!t.schedDate || t.schedDate > dateTo)) return false;
    return true;
  }).sort((a, b) => {
    const getTs = (id) => { const m = (id || '').match(/id-(\d{10,13})/); return m ? parseInt(m[1]) : 0; };
    return getTs(b.id) - getTs(a.id);
  });

  // Build a quick lookup for parent resolution
  const taskById = {};
  tasks.forEach(t => { taskById[t.id] = t; });

  // Done-tab specific dedup rules:
  //   The Ongoing / Upcoming tabs dedup cycle-rebirth chains (hide a "done"
  //   parent whose pending child is the current state, hide grandchild bug
  //   artefacts). Those rules are correct for "what should I work on" views,
  //   but they ALSO hide legitimate completed records — so the Done tab ends
  //   up empty even when there are dozens of completed cycles in history.
  //
  // We skip those two rules when tab === 'done' so the user can see every
  // completed record. The signature-dedup still applies (true duplicate
  // done rows are noise regardless of tab).
  const isDoneTab = tab === 'done';
  const doneSignatures = new Set();
  const filtered = rawFiltered.filter(t => {
    // Hide grandchild tasks (parent also has a parentTaskId) — bug artifacts.
    // Skipped on the Done tab: a completed grandchild is still a real completion.
    if (!isDoneTab && t.parentTaskId) {
      const parent = taskById[t.parentTaskId];
      if (parent?.parentTaskId) return false;
    }
    // Deduplicate identical done records (same name+assigned+schedDate+doneTime = true duplicate).
    // Applied on every tab — true duplicates are noise everywhere.
    if (t.status === 'done') {
      const sig = `${t.name}|${(t.assignedTo || []).slice().sort().join(',')}|${t.schedDate}|${t.doneTime}`;
      if (doneSignatures.has(sig)) return false;
      doneSignatures.add(sig);
    }
    // Hide done parent when a pending child exists (child represents the
    // current state). Skipped on the Done tab so users can see every
    // completed cycle, not just the most recent one without a live child.
    if (!isDoneTab && t.status === 'done') {
      const hasPendingChild = tasks.some(x => x.parentTaskId === t.id && x.status === 'pending');
      if (hasPendingChild) return false;
    }
    // NOTE: previously we deduped "multiple pending siblings" by hiding all
    // but the first pending child per parentTaskId. This was causing three
    // bugs on Manage Tasks: (1) counts (Ongoing/Upcoming/Done badges) didn't
    // match the table because the count used sourceList without dedup; (2)
    // deleting the visible row would surface a second pending child with
    // the same name/parent, making the user think the delete didn't work;
    // (3) after marking a row done (which creates a new pending child for
    // the next slot), the user saw a row move to Done and a same-named
    // row appear in Upcoming, which they read as "delete from Upcoming
    // went to Done". Showing every pending row directly is unambiguous —
    // the user can see all instances and delete them individually. The
    // grandchild filter above still hides true bug artifacts (parent of
    // the parent also has a parentTaskId), and the done-parent-with-
    // pending-child rule above still hides done parents whose pending
    // child represents the current state. Those two rules are correct.
    return true;
  });

  const paged = paginate(filtered, page);

  // Edit allowed: mainadmin always; others ONLY on tasks they themselves created.
// Even with tasks_edit permission, an employee cannot edit tasks assigned to
// them by someone else. The "my tasks" tab may show tasks assigned to me by
// others (e.g. by the main admin), but the ✏️ button must stay hidden on those.
  const canEditRow = (t) => isMain || (canEdit && t.createdBy === currentUser.name);
  const canDelRow = (t) => isMain || canDel;

  // Multi-select helpers — selection persists across pagination (Set), but
  // resets on tab switch (see useEffect above).
  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectPage() {
    const pageItems = paged.items;
    if (pageItems.length === 0) return;
    const allSelected = pageItems.every((t) => selectedIds.has(t.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        pageItems.forEach((t) => next.delete(t.id));
      } else {
        pageItems.forEach((t) => next.add(t.id));
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleSave(form) {
    const existing = editTask ? tasks.find((t) => t.id === editTask.id) : null;
    const obj = {
      id: existing?.id || uid(),
      name: form.name, dept: form.dept, freq: form.freq,
      assignedTo: form.assignedTo, assigneeEmails: form.assigneeEmails,
      schedDate: form.schedDate, time: form.time, priority: form.priority,
      notes: form.notes, status: existing?.status || 'pending',
      doneBy: existing?.doneBy || '', doneTime: existing?.doneTime || '',
      doneRemark: existing?.doneRemark || '', delayReason: existing?.delayReason || '',
      isDelayed: existing?.isDelayed || false, lastDone: existing?.lastDone || '',
      completionHistory: existing?.completionHistory || [],
      created: existing?.created || toDay(), createdBy: existing?.createdBy || currentUser.name,
      activityLog: [...(existing?.activityLog || []), { by: currentUser.name, action: existing ? 'EDITED' : 'CREATED', details: '', at: fDateTime() }],
      parentTaskId: existing?.parentTaskId || '',
      extensions: existing?.extensions || [],
    };
    const newTasks = existing ? tasks.map((t) => t.id === obj.id ? obj : t) : [...tasks, obj];
    await save('workdesk-tasks', newTasks);
    await logAct(existing ? 'TASK UPDATED' : 'TASK CREATED', obj.name);

    // Sync to delegations table when this is a delegation task (or when the
    // task was previously a delegation task and the freq just changed away
    // from it — in that case the orphan delegation record should be removed).
    const freqChanged = !!existing && existing.freq === 'delegation' && obj.freq !== 'delegation';
    await syncDelegationFromTask(obj, delegations, { save, moveToTrash }, { freqChanged });

    // Send assignment email to newly assigned employees.
    //
    // Defer the email to the scheduled date when schedDate is in the future:
    // the employee shouldn't get a "you're assigned X" email a week before
    // the task is actually due — by then they may have forgotten about it.
    // Instead, attach a `pendingAssignNotify` payload to the task; MyTasks's
    // processPendingNotifications effect fires the email when schedDate
    // arrives (the same way it fires deferred completion notifications).
    //
    // Tasks due today or earlier send the email immediately as before.
    //
    // If a previous assignment for this same task already deferred an email
    // (existing.pendingAssignNotify with notifySent=false), merge the new
    // assignee ids into the existing payload so everyone who was ever
    // assigned gets one email on the scheduled date — not just the most
    // recent set.
    //
    // Edge case: if admin edits the task to MOVE schedDate earlier (e.g.
    // from next week to today) and there's still a deferred email pending,
    // fire that deferred email immediately and clear the payload — the
    // employee should know about the assignment NOW, not wait for the new
    // future date that no longer exists.
    const prevAssigned = new Set(existing?.assignedTo || []);
    const newlyAssigned = (obj.assignedTo || []).filter(n => !prevAssigned.has(n));
    const todayStr = toDay();
    const isFuture = obj.schedDate && obj.schedDate > todayStr;
    const hadPendingEmail = existing?.pendingAssignNotify && !existing.pendingAssignNotify.notifySent;

    // Flush any previously-deferred email if the date is no longer in the
    // future (admin moved it earlier). The list of recipients is captured
    // from the existing payload, not from current assignedTo — someone who
    // was unassigned between deferral and flush shouldn't get the email.
    if (hadPendingEmail && !isFuture) {
      const pan = existing.pendingAssignNotify;
      const flushedAssignees = (pan.emailAssigneeIds || [])
        .map((id) => employees.find(e => e.id === id))
        .filter(Boolean);
      if (flushedAssignees.length) {
        sendTaskAssignedEmail(obj, flushedAssignees, pan.assignedBy || currentUser.name, pan.taskType || 'Normal Task');
      }
      // Clear the payload so it doesn't fire again on the next edit.
      const withoutPending = newTasks.map((t) => t.id === obj.id
        ? { ...t, pendingAssignNotify: undefined }
        : t);
      await save('workdesk-tasks', withoutPending);
      // Update the local reference so the rest of the function sees the
      // cleared payload.
      newTasks.splice(0, newTasks.length, ...withoutPending);
    }

    if (newlyAssigned.length > 0) {
      const taskType = obj.freq === 'delegation' ? 'Delegation Task' : 'Normal Task';
      const assigneeEmps = employees.filter(e => newlyAssigned.some(n => n.toUpperCase() === e.name.toUpperCase()));
      if (isFuture) {
        // Merge new assignee ids with any previously-deferred payload so a
        // task reassigned across edits accumulates everyone who's owed an
        // email. notifySent stays false (the email hasn't fired yet — the
        // scheduled date is still in the future).
        const existingIds = Array.isArray(existing?.pendingAssignNotify?.emailAssigneeIds)
          ? existing.pendingAssignNotify.emailAssigneeIds
          : [];
        const mergedIds = Array.from(new Set([
          ...existingIds,
          ...assigneeEmps.filter(e => e.email).map(e => e.id),
        ]));
        const pendingAssignNotify = {
          emailAssigneeIds: mergedIds,
          assignedBy: existing?.pendingAssignNotify?.assignedBy || currentUser.name,
          taskType,
          notifySent: false,
        };
        const withNotify = newTasks.map((t) => t.id === obj.id ? { ...t, pendingAssignNotify } : t);
        await save('workdesk-tasks', withNotify);
      } else {
        // Due today or in the past — send immediately (existing behaviour).
        sendTaskAssignedEmail(obj, assigneeEmps, currentUser.name, taskType);
      }
    }

    setShowForm(false);
    setEditTask(null);
  }

  async function handleDone({ remark, delayReason, isDelayed }) {
    const t = showDone;
    const now = new Date();
    const nowStr = now.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
    const today = toDay();
    const updated = {
      ...t, status: 'done', doneBy: currentUser.name, doneTime: nowStr,
      doneRemark: remark, delayReason, isDelayed, lastDone: today,
      activityLog: [...(t.activityLog || []), { by: currentUser.name, action: 'COMPLETED' + (isDelayed ? ' (DELAYED)' : ''), details: remark, at: nowStr }],
    };
    // Find the root of the chain so every auto-cycled child links back to
    // the original template — keeps the chain at depth 1 and prevents the
    // grandchild filter from hiding fresh pending slots.
    const root = (() => {
      let cur = t;
      const seen = new Set();
      while (cur && cur.parentTaskId && !seen.has(cur.id)) {
        seen.add(cur.id);
        cur = taskById[cur.parentTaskId];
        if (!cur) break;
      }
      return cur || t;
    })();
    const rootId = root.id;
    const pendingChildExists = tasks.some(x => x.parentTaskId === rootId && x.status === 'pending' && x.id !== t.id);
    let newTasks = tasks.map((x) => x.id === t.id ? updated : x);
    if (!pendingChildExists && t.freq !== 'delegation') {
      const child = {
        id: uid(), name: t.name, dept: t.dept, freq: t.freq,
        assignedTo: [...(t.assignedTo || [])], assigneeEmails: [...(t.assigneeEmails || [])],
        time: t.time || '', schedDate: getNextScheduledDate(t.freq, t.schedDate, today), priority: t.priority,
        notes: t.notes || '', status: 'pending',
        doneBy: '', doneTime: '', doneRemark: '', delayReason: '',
        isDelayed: false, lastDone: '', completionHistory: [], extensions: [],
        created: today, createdBy: 'SYSTEM',
        activityLog: [{ by: 'SYSTEM', action: 'AUTO CYCLE', details: 'Freq: ' + t.freq + ', next slot: ' + getNextScheduledDate(t.freq, t.schedDate, today), at: fDateTime() }],
        parentTaskId: rootId,
      };
      newTasks = [...newTasks, child];
    }
    await save('workdesk-tasks', newTasks);
    await logAct('TASK COMPLETED', t.name + (isDelayed ? ' [DELAYED]' : ''));
    // Mirror completion into workdesk-delegations so the Delegation Tracker page
    // and the dashboard drill-down popup reflect the same status / remark.
    if (t.freq === 'delegation') {
      await syncDelegationFromTask(updated, delegations, { save, moveToTrash });
    }
    // Notify main admin bell
    await notifyAdmins({
      notices, save,
      subject: isDelayed ? `⚠️ ${currentUser.name} — DELAYED TASK COMPLETED` : `✅ ${currentUser.name} completed: ${t.name}`,
      message: `Task: ${t.name}\nDepartment: ${t.dept}\nDone By: ${currentUser.name}\nTime: ${nowStr}${isDelayed ? '\n\n⚠️ Completed late — Reason: ' + (delayReason || '—') : ''}${remark ? '\nRemark: ' + remark : ''}`,
      type: 'task_completed',
      meta: { taskId: t.id, doneBy: currentUser.name, isDelayed, taskName: t.name },
    });
    setShowDone(null);
  }

  async function handleDelete(task) {
    if (!confirm(`Move '${task.name}' to Trash?`)) return;
    const result = await moveToTrash('task', task.id);
    if (result?.error) {
      alert('Delete failed: ' + (result.message || result.reason || 'unknown error'));
      return;
    }
    // Mirror the deletion: if this was a delegation task, drop the matching
    // delegation record too so the Delegation Tracker page doesn't keep
    // showing it as a ghost entry.
    if (task.freq === 'delegation') {
      const target = delegations.find((d) => d.id === task.id);
      if (target) {
        try { await moveToTrash('delegation', task.id); } catch (e) { /* non-fatal */ }
      }
    }
    // Non-main-admin deletes notify the main admin's notice bell so the
    // admin knows who trashed what. Main admin's own deletes skip this
    // (no need to ping themselves).
    if (currentRole !== 'mainadmin') {
      try {
        await notifyAdmins({
          notices, save,
          subject: `🗑️ ${currentUser.name} deleted a task`,
          message: `Task: ${task.name}\nDepartment: ${task.dept || '—'}\nFrequency: ${task.freq || '—'}\nAssigned To: ${(task.assignedTo || []).join(', ') || '—'}\nDeleted By: ${currentUser.name}`,
          type: 'task_deleted',
          meta: { taskId: task.id, deletedBy: currentUser.name, taskName: task.name },
        });
      } catch (e) { console.error('notifyAdmins (single delete) failed:', e); }
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      // Only delete rows the current user is allowed to delete (employees
      // can only delete on the "mine" tab; main admin can delete anywhere).
      const toDelete = tasks.filter((t) => selectedIds.has(t.id) && canDelRow(t));
      if (toDelete.length === 0) {
        alert('None of the selected tasks can be deleted by you.');
        return;
      }
      const msg = `Move ${toDelete.length} task${toDelete.length === 1 ? '' : 's'} to Trash? This cannot be undone.`;
      if (!confirm(msg)) return;

      // Trash each task. moveToTrash internally logs activity via
      // logAct('DELETE TASK', ...) so we get one entry per task in the
      // activity log automatically — preserves per-task audit granularity.
      for (const t of toDelete) {
        try { await moveToTrash('task', t.id); } catch (e) { console.error('bulk delete failed for', t.id, e); }
      }
      // Mirror deletion into workdesk-delegations for any delegation tasks in the batch
      for (const t of toDelete) {
        if (t.freq === 'delegation') {
          const target = delegations.find((d) => d.id === t.id);
          if (target) {
            try { await moveToTrash('delegation', t.id); } catch (e) { /* non-fatal */ }
          }
        }
      }
      // Single aggregated notification for non-main-admin users — one bell
      // entry per bulk action, not per task, so the admin isn't spammed.
      if (currentRole !== 'mainadmin') {
        const lines = toDelete.map((t) => `• ${t.name} — ${t.dept || '—'} — ${t.freq || '—'}`);
        try {
          await notifyAdmins({
            notices, save,
            subject: `🗑️ ${currentUser.name} deleted ${toDelete.length} task${toDelete.length === 1 ? '' : 's'}`,
            message: `Deleted By: ${currentUser.name}\nCount: ${toDelete.length}\n\nTasks:\n${lines.join('\n')}`,
            type: 'task_deleted_bulk',
            meta: {
              deletedBy: currentUser.name,
              count: toDelete.length,
              names: toDelete.slice(0, 20).map((t) => t.name),
            },
          });
        } catch (e) { console.error('notifyAdmins (bulk delete) failed:', e); }
      }
      clearSelection();
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleExtDecide(task, extId, decision, decidedBy) {
    const today = fDate(new Date().toISOString().slice(0, 10));
    const updatedExts = (task.extensions || []).map((x) =>
      x.id === extId ? { ...x, status: decision, respondedBy: decidedBy, respondedAt: today } : x
    );
    const approvedExt = updatedExts.find((x) => x.id === extId && decision === 'approved');
    const updated = {
      ...task,
      extensions: updatedExts,
      ...(approvedExt ? { schedDate: approvedExt.newDate } : {}),
      activityLog: [...(task.activityLog || []), { by: decidedBy, action: `EXTENSION ${decision.toUpperCase()}`, details: approvedExt ? `New date: ${approvedExt.newDate}` : '', at: fDateTime() }],
    };
    const newTasks = tasks.map((t) => t.id === task.id ? updated : t);
    await save('workdesk-tasks', newTasks);
    await logAct(`DELEGATION EXTENSION ${decision.toUpperCase()}`, task.name);
    // If the extension was approved on a delegation task, push it to the
    // delegation record so the workflow page reflects the new due date.
    if (task.freq === 'delegation' && approvedExt) {
      const next = delegations.map((d) =>
        d.id === task.id
          ? { ...d, dueDate: approvedExt.newDate, expDate: approvedExt.newDate, status: 'extended', updatedAt: new Date().toISOString() }
          : d
      );
      try { await save('workdesk-delegations', next); } catch (e) { /* non-fatal */ }
    }
    setShowExtApproval(updated);
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-header-title" style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>Manage Tasks</h2>
        <div className="page-header-actions">
          <button onClick={() => setShowExport(true)} style={{ ...BtnS, background: '#1a7a4a' }}>⬇ Export</button>
          <button onClick={() => window.print()} style={{ ...BtnS, background: '#334155' }}>🖨 Print</button>
          {canAdd && <button onClick={() => { setEditTask(null); setShowForm(true); }} style={{ ...BtnS, background: '#0d7377' }}>＋ New Task</button>}
        </div>
      </div>

      {/* Employees always see only their own tasks (assignedTo / createdBy),
          so the "Mine" tab IS their full list — no extra "All" tab needed.
          Main admin sees the full unfiltered list by default. */}

      {/* Ongoing / Upcoming / Done tabs:
            ongoing   → current-date pending tasks (the actionable queue)
            upcoming  → future-dated pending tasks (scheduled but not yet due)
            done      → completed tasks (the historical record)
          The split is date × status: ongoing/upcoming are date-bucketed
          pending, done is everything status === 'done'. The Status
          dropdown filter can still narrow within a tab. */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '2px solid #d8e2ef' }}>
        {[
          { key: 'ongoing', label: '🔄 Ongoing', count: ongoingCount, color: '#0d7377' },
          { key: 'upcoming', label: '📅 Upcoming', count: upcomingCount, color: '#7c3aed' },
          { key: 'done', label: '✅ Done', count: doneCount, color: '#1a7a4a' },
        ].map((t) => {
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setPage(1); }}
              style={{
                padding: '9px 18px',
                borderRadius: '8px 8px 0 0',
                border: 'none',
                borderBottom: isActive ? `3px solid ${t.color}` : '3px solid transparent',
                background: isActive ? 'white' : 'transparent',
                color: isActive ? t.color : '#6b7a90',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: 13,
                marginBottom: '-2px',
                transition: 'all 0.15s',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>{t.label}</span>
              <span style={{
                display: 'inline-block',
                minWidth: 22,
                padding: '2px 8px',
                borderRadius: 12,
                background: isActive ? t.color : '#d8e2ef',
                color: isActive ? 'white' : '#6b7a90',
                fontSize: 11,
                fontWeight: 800,
                lineHeight: 1.4,
                textAlign: 'center',
              }}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters — small right-aligned button matching the New Task button size.
          Click → opens a bottom-anchored sheet on mobile (<=768px) and
          a centered modal on desktop. Same controls in both cases; state
          lives at the page level so the search box stays in sync.
          A small "✕ Clear" pill appears next to the button only when
          filters are active. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            style={{
              padding: '9px 14px', borderRadius: 8,
              background: '#fde8e8', color: '#c0392b',
              border: '1.5px solid #f5b7b1',
              fontWeight: 800, fontSize: 13,
              display: 'inline-flex', alignItems: 'center', gap: 5,
              cursor: 'pointer', whiteSpace: 'nowrap',
              fontFamily: "'Nunito',sans-serif",
            }}
            title="Clear all filters"
          >
            ✕ Clear
          </button>
        )}
        <button
          onClick={() => setMobileSheetOpen(true)}
          style={{
            padding: '9px 18px', borderRadius: 8, border: 'none',
            background: activeFilterCount > 0 ? '#0d7377' : '#334155',
            color: 'white',
            fontWeight: 800, fontSize: 13,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            cursor: 'pointer',
            fontFamily: "'Nunito',sans-serif",
            boxShadow: activeFilterCount > 0 ? '0 2px 8px rgba(13,115,119,0.25)' : 'none',
          }}
          aria-label="Open filters"
        >
          🔍 Filters
          {activeFilterCount > 0 && (
            <span style={{
              background: 'rgba(255,255,255,0.25)',
              color: 'white',
              padding: '1px 7px', borderRadius: 10,
              fontSize: 11, fontWeight: 800,
              minWidth: 20, textAlign: 'center',
            }}>
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Filter sheet — works on all viewports.
          Mobile (<=768px): bottom-anchored sheet with drag handle.
          Desktop (>768px): centered modal with rounded corners.
          State stays in sync because we use the same setters. Scroll lock
          on body while open so the sheet doesn't scroll the page behind it. */}
      {mobileSheetOpen && (() => {
        const isMobileLayout = typeof window !== 'undefined' && window.innerWidth <= 768;
        return (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setMobileSheetOpen(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(10,22,40,0.55)',
            display: 'flex',
            alignItems: isMobileLayout ? 'flex-end' : 'center',
            justifyContent: 'center',
            padding: isMobileLayout ? 0 : 20,
          }}
        >
          <div style={{
            background: 'white',
            width: '100%',
            maxWidth: isMobileLayout ? 520 : 460,
            borderRadius: isMobileLayout ? '18px 18px 0 0' : 14,
            boxShadow: isMobileLayout ? '0 -16px 48px rgba(0,0,0,0.25)' : '0 20px 60px rgba(0,0,0,0.30)',
            maxHeight: isMobileLayout ? '88vh' : '85vh',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Drag handle — mobile only */}
            {isMobileLayout && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
                <div style={{ width: 44, height: 4, background: '#d8e2ef', borderRadius: 4 }} />
              </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobileLayout ? '4px 18px 12px' : '16px 20px 14px', borderBottom: '1px solid #e8eef5' }}>
              <div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: '#0b1e3d', fontWeight: 700 }}>🔍 Filters</div>
                <div style={{ fontSize: 11, color: '#6b7a90', marginTop: 2 }}>{activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'} applied` : 'No filters applied'}</div>
              </div>
              <button
                onClick={() => setMobileSheetOpen(false)}
                style={{ width: 32, height: 32, borderRadius: 8, background: '#f3f7fc', border: 'none', color: '#1a2535', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}
                aria-label="Close filters"
              >✕</button>
            </div>

            {/* Scrollable body */}
            <div style={{ overflowY: 'auto', padding: '16px 18px 8px' }}>
              {/* Search input — always at the top so the user can type without scrolling */}
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="SEARCH TASK OR DEPT..."
                  style={{ ...IS, paddingLeft: 36, paddingRight: search ? 36 : 13 }}
                  autoFocus
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#6b7a90', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 4 }}
                    aria-label="Clear search"
                  >✕</button>
                )}
              </div>

              {/* Dept + Employee — same row. Employee dropdown is scoped by
                  the selected department so it only lists people who
                  actually belong there. If the user clears the dept, the
                  employee list resets so we don't show stale options. */}
              <Field label="Department / Employee">
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    value={filterDept}
                    onChange={(e) => {
                      setFilterDept(e.target.value);
                      // Reset employee when dept changes — the previously
                      // selected employee may not belong to the new dept.
                      if (filterEmployee) setFilterEmployee('');
                    }}
                    style={{ ...IS, flex: 1 }}
                  >
                    <option value="">ALL DEPTS</option>
                    {depts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                  </select>
                  <select
                    value={filterEmployee}
                    onChange={(e) => setFilterEmployee(e.target.value)}
                    style={{ ...IS, flex: 1 }}
                    disabled={!filterDept}
                    title={!filterDept ? 'Select a department first' : 'Filter by employee'}
                  >
                    <option value="">{filterDept ? 'ALL EMPLOYEES' : 'SELECT DEPT'}</option>
                    {filterDept && employees
                      .filter((emp) => (emp.dept || '').toUpperCase() === filterDept.toUpperCase())
                      .map((emp) => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
                  </select>
                </div>
              </Field>

              {/* Date filter — chip row for presets, plus a from/to input
                  row that becomes required when "custom" is selected.
                  Applied to schedDate (the column shown in the table).
                  Custom range is inclusive on both ends.
                  Labels are kept short + flexWrap allows chips to drop
                  to the next line on narrow widths so text never clips. */}
              <Field label="Date Range">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { v: '', l: 'ALL' },
                    { v: 'thisMonth', l: 'THIS MONTH' },
                    { v: 'last30', l: 'LAST 30D' },
                    { v: 'custom', l: 'CUSTOM' },
                  ].map((opt) => (
                    <button
                      key={opt.v || 'all'}
                      onClick={() => {
                        setFilterDatePreset(opt.v);
                        // Switching to/from custom clears the from/to
                        // inputs so the user starts fresh each time.
                        if (opt.v !== 'custom') {
                          setFilterDateFrom('');
                          setFilterDateTo('');
                        }
                      }}
                      style={{
                        flex: '1 1 0', minWidth: 0, padding: '9px 6px', borderRadius: 8,
                        background: filterDatePreset === opt.v ? '#0d7377' : '#f8fbff',
                        color: filterDatePreset === opt.v ? 'white' : '#1a2535',
                        border: `1.5px solid ${filterDatePreset === opt.v ? '#0d7377' : '#d8e2ef'}`,
                        fontWeight: 800, fontSize: 11, cursor: 'pointer',
                        // Allow text to wrap inside the chip rather than
                        // forcing the chip to overflow — at narrow widths
                        // a two-line chip is better than clipped text.
                        whiteSpace: 'normal',
                        textAlign: 'center',
                        lineHeight: 1.25,
                      }}
                    >{opt.l}</button>
                  ))}
                </div>
                {/* Custom range inputs — only render when preset === 'custom'
                    so the form stays compact for users who picked a preset. */}
                {filterDatePreset === 'custom' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                    <input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      style={{ ...IS, flex: 1 }}
                      aria-label="From date"
                    />
                    <span style={{ color: '#6b7a90', fontSize: 12, fontWeight: 800 }}>→</span>
                    <input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      style={{ ...IS, flex: 1 }}
                      aria-label="To date"
                    />
                  </div>
                )}
                {/* Active date window — small readout under the chips so
                    the user can confirm what they actually applied. */}
                {(dateFrom || dateTo) && (
                  <div style={{ fontSize: 11, color: '#6b7a90', marginTop: 8 }}>
                    Showing: <strong style={{ color: '#0d7377' }}>{dateFrom || '…'} → {dateTo || '…'}</strong>
                  </div>
                )}
              </Field>
            </div>

            {/* Sticky footer */}
            <div style={{
              display: 'flex', gap: 8, padding: '12px 18px 18px',
              borderTop: '1px solid #e8eef5',
              background: 'white',
            }}>
              <button
                onClick={clearAllFilters}
                disabled={activeFilterCount === 0}
                style={{
                  flex: '0 0 auto', padding: '11px 16px', borderRadius: 9,
                  background: activeFilterCount === 0 ? '#f3f7fc' : 'white',
                  color: activeFilterCount === 0 ? '#b0bec5' : '#c0392b',
                  border: `1.5px solid ${activeFilterCount === 0 ? '#d8e2ef' : '#f5b7b1'}`,
                  fontWeight: 800, fontSize: 13,
                  cursor: activeFilterCount === 0 ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >✕ Clear</button>
              <button
                onClick={() => setMobileSheetOpen(false)}
                style={{
                  flex: 1, padding: '11px 16px', borderRadius: 9,
                  background: '#0d7377', color: 'white', border: 'none',
                  fontWeight: 800, fontSize: 13, cursor: 'pointer',
                }}
              >Apply Filters ({activeFilterCount})</button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Bulk-action bar — appears once at least one task is selected */}
      {canDel && selectedIds.size > 0 && (
        <div style={{
          background: '#fff3cd', border: '1.5px solid #ffc107', borderRadius: 10,
          padding: '10px 14px', marginBottom: 12, display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: '#7a4800' }}>
            ✅ {selectedIds.size} task{selectedIds.size === 1 ? '' : 's'} selected
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={clearSelection}
              disabled={bulkBusy}
              style={{ padding: '7px 14px', borderRadius: 8, background: 'white', color: '#7a4800', border: '1.5px solid #ffc107', cursor: bulkBusy ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 12 }}
            >✕ Clear</button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkBusy}
              style={{ padding: '7px 14px', borderRadius: 8, background: bulkBusy ? '#e57373' : '#c0392b', color: 'white', border: 'none', cursor: bulkBusy ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 12 }}
            >{bulkBusy ? '⏳ Deleting...' : `🗑️ Delete Selected (${selectedIds.size})`}</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="tasks-table" style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th className="col-hide-mobile" style={{ width: 36, padding: '9px 13px', background: '#f3f7fc', borderBottom: '1px solid #d8e2ef', textAlign: 'center' }}>
                  {canDel && paged.items.length > 0 && (
                    <input
                      type="checkbox"
                      checked={paged.items.every((t) => selectedIds.has(t.id))}
                      onChange={toggleSelectPage}
                      title="Select all on this page"
                      style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#0d7377' }}
                    />
                  )}
                </th>
                {['Assign Date', 'Status', 'Task', 'Dept', 'Assigned', 'Frequency', 'Sched. Date', 'Completion', 'Actions'].map((h) => {
                  // Mobile-only: hide 6 of the 9 columns to leave Assign Date,
                  // Status, Task visible. `col-hide-mobile` is no-op on desktop.
                  const hideOnMobile = ['Dept', 'Assigned', 'Frequency', 'Sched. Date', 'Completion', 'Actions'].includes(h);
                  return (
                    <th key={h} className={hideOnMobile ? 'col-hide-mobile' : ''} style={{ background: '#f3f7fc', padding: '9px 13px', textAlign: 'left', fontSize: 10.5, fontWeight: 800, color: '#6b7a90', letterSpacing: 0.8, textTransform: 'uppercase', borderBottom: '1px solid #d8e2ef' }}>{h}</th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {paged.items.length ? paged.items.map((t) => {
                const late = wasCompletedLate(t);
                const isDone = t.status === 'done';
                return (
                  <tr key={t.id} style={{ background: late ? '#faf5ff' : 'white', cursor: 'pointer', transition: 'background 0.15s' }}
                    onClick={() => setShowDetail(t)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f0f8ff'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = late ? '#faf5ff' : 'white'; }}
                  >
                    <td className="col-hide-mobile" style={{ padding: '11px 13px', verticalAlign: 'middle', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      {canDel && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(t.id)}
                          disabled={!canDelRow(t)}
                          onChange={() => toggleSelected(t.id)}
                          style={{ width: 15, height: 15, cursor: canDelRow(t) ? 'pointer' : 'not-allowed', accentColor: '#0d7377' }}
                          title={canDelRow(t) ? 'Select' : 'You cannot delete this task'}
                        />
                      )}
                    </td>
                    <td style={{ padding: '11px 13px', verticalAlign: 'middle', fontSize: 12, color: '#334155', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {(() => {
                        const m = (t.id || '').match(/id-(\d{10,13})/);
                        if (m) {
                          const d = new Date(parseInt(m[1]));
                          return <>
                            <div style={{ fontWeight: 700, color: '#0b1e3d' }}>{d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</div>
                            <div style={{ fontSize: 11, color: '#6b7a90' }}>{d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>
                          </>;
                        }
                        return <span style={{ color: '#6b7a90' }}>{t.created ? fDate(t.created) : '—'}</span>;
                      })()}
                    </td>
                    <td style={{ padding: '11px 13px', verticalAlign: 'middle' }}>
                      {t.status === 'cancelled' ? <span title={t.cancelReason || 'Cancelled'} style={{ background: '#fde8e8', color: '#7d1a1a', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>🚫 CANCELLED</span>
                        : t.status === 'rejected' ? <span style={{ background: '#fde8e8', color: '#7d1a1a', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>❌ REJECTED</span>
                        : t.status === 'trashed' ? <span style={{ background: '#f3f4f6', color: '#4b5563', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>🗑️ TRASHED</span>
                        : isDone && !late ? <span style={{ background: '#d4edda', color: '#155724', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>✅ ON TIME</span>
                        : isDone && late ? <span style={{ background: '#ede9fe', color: '#4c1d95', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>⏰ DELAYED</span>
                        : t.priority === 'high' ? <span style={{ background: '#fde8e8', color: '#7d1a1a', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>⚠️ PENDING</span>
                        : <span style={{ background: '#fff3cd', color: '#7a4800', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>⏳ PENDING</span>}
                    </td>
                    <td style={{ padding: '11px 13px', verticalAlign: 'middle' }}>
                      <strong>{t.name}</strong>
                      {t.assignedTo?.length ? <div style={{ fontSize: 10.5, color: '#1a56db' }}>👤 {t.assignedTo.join('+')}</div> : null}
                      {t.createdBy && <div style={{ fontSize: 10.5, color: '#6b7a90' }}>📌 By: {t.createdBy}</div>}
                    </td>
                    <td className="col-hide-mobile" style={{ padding: '11px 13px', verticalAlign: 'middle' }}><DeptTag name={t.dept} /></td>
                    <td className="col-hide-mobile" style={{ padding: '11px 13px', verticalAlign: 'middle', fontSize: 12 }}>{t.assignedTo?.join(', ') || '—'}</td>
                    <td className="col-hide-mobile" style={{ padding: '11px 13px', verticalAlign: 'middle' }}><FreqBadge freq={t.freq} /></td>
                    <td className="col-hide-mobile" style={{ padding: '11px 13px', verticalAlign: 'middle', fontSize: 12, color: '#0d7377', fontWeight: 700 }}>
                      {t.schedDate ? fDate(t.schedDate) : '—'}
                      {t.time && <div style={{ fontSize: 11 }}>⏰ {t.time}</div>}
                    </td>
                    <td className="col-hide-mobile" style={{ padding: '11px 13px', verticalAlign: 'middle', fontSize: 11 }}>
                      {t.doneBy ? <><strong>{t.doneBy}</strong><br /><span style={{ color: '#0d7377' }}>{t.doneTime || ''}</span></> : '—'}
                    </td>
                    <td className="col-hide-mobile" style={{ padding: '11px 13px', verticalAlign: 'middle' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button onClick={() => setShowDetail(t)} style={{ background: 'none', border: '1px solid #d8e2ef', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: '#0d7377' }} title="View details">👁</button>
                        {t.freq === 'delegation' && (currentUser.name === t.createdBy || currentRole === 'mainadmin') && (
                          <button
                            onClick={() => setShowExtApproval(t)}
                            style={{ background: (t.extensions || []).some((x) => x.status === 'pending') ? '#fef3c7' : '#f3f7fc', border: `1px solid ${(t.extensions || []).some((x) => x.status === 'pending') ? '#f5c842' : '#d8e2ef'}`, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11, color: (t.extensions || []).some((x) => x.status === 'pending') ? '#92400e' : '#6b7a90', fontWeight: 700 }}
                          >
                            🔄 {(t.extensions || []).length}/3{(t.extensions || []).some((x) => x.status === 'pending') ? ' ⚠️' : ''}
                          </button>
                        )}
                        {!isDone && isAssignedTo(t, currentUser.name) && (
                          <button onClick={() => setShowDone(t)} style={{ background: 'none', border: '1px solid #d8e2ef', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: '#1a7a4a' }}>✅</button>
                        )}
                        {canEditRow(t) && <button onClick={() => { setEditTask(t); setShowForm(true); }} style={{ background: 'none', border: '1px solid #d8e2ef', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>✏️</button>}
                        {canDelRow(t) && <button onClick={() => handleDelete(t)} style={{ background: 'none', border: '1px solid #d8e2ef', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: '#c0392b' }}>🗑️</button>}
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={10}>
                  <EmptyState
                    icon={tab === 'upcoming' ? '📅' : tab === 'done' ? '✅' : '🔄'}
                    message={tab === 'upcoming' ? 'NO UPCOMING TASKS — ALL CLEAR!' : tab === 'done' ? 'NO COMPLETED TASKS YET' : 'NO ONGOING TASKS — ALL CLEAR!'}
                  />
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ borderTop: '1px solid #d8e2ef', padding: '0 8px' }}>
          <Pagination {...paged} onPage={(p) => setPage(p)} />
        </div>
      </div>

      <TaskFormModal open={showForm} onClose={() => { setShowForm(false); setEditTask(null); }} onSave={handleSave} editTask={editTask} depts={depts} employees={employees} />
      <TaskDetailModal task={showDetail} open={!!showDetail} onClose={() => setShowDetail(null)} onDone={(t) => setShowDone(t)} canEdit={showDetail ? canEditRow(showDetail) : false} onEdit={(t) => { setShowDetail(null); setEditTask(t); setShowForm(true); }} onDelete={handleDelete} currentUser={currentUser} currentRole={currentRole} />
      <DoneModal task={showDone} open={!!showDone} onClose={() => setShowDone(null)} onSubmit={handleDone} currentUser={currentUser} />
      <ExtensionApprovalModal task={showExtApproval} open={!!showExtApproval} onClose={() => setShowExtApproval(null)} onDecide={handleExtDecide} currentUser={currentUser} />
      <DateRangeExportModal
        open={showExport}
        onClose={() => setShowExport(false)}
        title="Tasks Export"
        onExport={(from, to) => {
          const rows = filtered.filter(t => t.created >= from && t.created <= to);
          exportToExcel(rows.map(t => ({
            'Assign Date': t.created || '—',
            'Task': t.name,
            'Department': t.dept,
            'Frequency': t.freq,
            'Assigned To': (t.assignedTo || []).join(', '),
            'Assigned By': t.createdBy || '—',
            'Sched. Date': t.schedDate || '—',
            'Priority': t.priority,
            'Status': t.status === 'done' ? (wasCompletedLate(t) ? 'Delayed' : 'On Time') : t.status === 'cancelled' ? 'Cancelled' : t.status === 'rejected' ? 'Rejected' : t.status === 'trashed' ? 'Trashed' : 'Pending',
            'Done By': t.doneBy || '—',
            'Done Time': t.doneTime || '—',
            'Delay Reason': t.delayReason || '—',
          })), `Tasks_${from}_to_${to}`);
        }}
      />
    </div>
  );
}
