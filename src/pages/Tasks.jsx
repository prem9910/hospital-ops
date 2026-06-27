import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { uid, toDay, fDate, fDateTime, wasCompletedLate, parseTimeToMinutes, isAssignedTo, notifyAdmins, exportToExcel } from '../utils';
import { FREQ_LABELS, FREQ_OPTIONS, PRIORITY_OPTIONS } from '../constants';
import { DeptTag, PriorityBadge, FreqBadge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { Alert, EmptyState } from '../components/common/Alert';
import { DateRangeExportModal } from '../components/common/DateRangeExportModal';
import { Pagination, paginate } from '../components/common/Pagination';
import { sendTaskAssignedEmail } from '../lib/emailService';

// ─── Task Detail Modal ──────────────────────────────────────────────────────
function TaskDetailModal({ task, open, onClose, onDone, canEdit, onEdit, onDelete, currentUser, currentRole }) {
  if (!task) return null;
  const isDone = task.status === 'done';
  const late = wasCompletedLate(task);
  const actHtml = (task.activityLog || []);

  return (
    <Modal open={open} onClose={onClose} title={task.name} maxWidth="max-w-xl">
      {/* Status banner */}
      {isDone && !late ? (
        <div style={{ background: '#d4edda', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 18 }}>✅</span>
          <div><div style={{ fontWeight: 800, color: '#155724' }}>COMPLETED ON TIME</div>
            <div style={{ fontSize: 11.5, color: '#1a7a4a' }}>By {task.doneBy || '—'} at {task.doneTime || '—'}</div></div>
        </div>
      ) : isDone && late ? (
        <div style={{ background: '#ede9fe', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
          <div style={{ fontWeight: 800, color: '#4c1d95' }}>⏰ COMPLETED WITH DELAY</div>
        </div>
      ) : (
        <div style={{ background: '#fff3cd', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
          <div style={{ fontWeight: 800, color: '#7a4800' }}>⏳ PENDING</div>
        </div>
      )}

      {/* Info */}
      <Section title="📋 Task Information">
        <Row label="Task Name"><strong>{task.name}</strong></Row>
        <Row label="Department"><DeptTag name={task.dept} /></Row>
        <Row label="Priority"><PriorityBadge priority={task.priority} /></Row>
        <Row label="Frequency"><FreqBadge freq={task.freq} /></Row>
        <Row label="Sched. Date"><span style={{ color: '#0d7377', fontWeight: 800 }}>{task.schedDate ? fDate(task.schedDate) + (task.time ? ' — ' + task.time : '') : '—'}</span></Row>
        {task.notes && <Row label="Notes"><span style={{ color: '#6b7a90' }}>{task.notes}</span></Row>}
      </Section>

      <Section title="👤 Assigned By / Assigned To">
        {task.createdBy && (
          <Row label="Assigned By">
            <span style={{ background: '#e8f4fd', color: '#0d7377', padding: '4px 10px', borderRadius: 8, fontWeight: 800, fontSize: 12 }}>
              👤 {task.createdBy}
            </span>
          </Row>
        )}
        <Row label="Assigned To">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(task.assignedTo || []).map((name, i) => (
              <div key={i} style={{ background: '#0b1e3d', color: 'white', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700 }}>
                {name}
                {task.assigneeEmails?.[i] && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{task.assigneeEmails[i]}</div>}
              </div>
            ))}
          </div>
        </Row>
      </Section>

      {isDone && (
        <Section title="✅ Completion Details">
          <Row label="Done By"><strong>{task.doneBy || '—'}</strong></Row>
          <Row label="Done At"><span style={{ color: '#0d7377', fontWeight: 800 }}>{task.doneTime || '—'}</span></Row>
          {task.doneRemark && <Row label="Remark">{task.doneRemark}</Row>}
        </Section>
      )}

      {late && task.delayReason && (
        <div style={{ background: '#faf5ff', border: '1.5px solid #c4b5fd', borderRadius: 8, padding: '10px 13px', marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#6d28d9', marginBottom: 6 }}>⏰ DELAY REASON</div>
          <div style={{ fontSize: 13, color: '#6d28d9', fontWeight: 600 }}>{task.delayReason}</div>
        </div>
      )}

      {/* Activity log */}
      <Section title="📜 Activity Log">
        {actHtml.length ? actHtml.map((a, i) => (
          <div key={i} style={{ padding: '5px 0', borderBottom: '1px solid #f0f4f9', fontSize: 11.5 }}>
            <strong>{a.by}</strong> — {a.action} <span style={{ color: '#6b7a90' }}>{a.details || ''}</span>
            <span style={{ float: 'right', color: '#6b7a90', fontSize: 10.5 }}>{a.at}</span>
          </div>
        )) : <span style={{ color: '#6b7a90', fontSize: 12 }}>No activity</span>}
      </Section>

      {/* Actions */}
      {!isDone && isAssignedTo(task, currentUser?.name) && (
        <button onClick={() => { onClose(); onDone(task); }} style={{ marginTop: 8, padding: '9px 16px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
          ✅ Mark Complete
        </button>
      )}
      {canEdit && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={() => { onClose(); onEdit(task); }} style={{ padding: '7px 14px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>✏️ Edit</button>
          <button onClick={() => { onClose(); onDelete(task); }} style={{ padding: '7px 14px', borderRadius: 8, background: '#c0392b', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>🗑️ Delete</button>
        </div>
      )}
    </Modal>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: '#f8fbff', borderRadius: 9, padding: '12px 14px', marginBottom: 10, border: '1px solid #d8e2ef' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 5, alignItems: 'flex-start' }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 100, paddingTop: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2535', flex: 1 }}>{children}</div>
    </div>
  );
}

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
  const blank = { name: '', dept: '', freq: 'daily', assignedTo: [], assigneeEmails: [], schedDate: '', time: '', priority: 'medium', notes: '' };
  const [form, setForm] = useState(blank);

  function reset(t) {
    setForm(t ? {
      name: t.name, dept: t.dept, freq: t.freq,
      assignedTo: t.assignedTo || [], assigneeEmails: t.assigneeEmails || [],
      schedDate: t.schedDate || '', time: t.time || '',
      priority: t.priority, notes: t.notes || '',
    } : blank);
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
// delegation task also mirrors a corresponding row into `hops-delegations`.
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
  try { await save('hops-delegations', next); } catch (e) { console.error('syncDelegationFromTask save failed:', e); }
  return next;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Tasks() {
  const { currentRole, currentUser, hasPerm } = useAuth();
  const { tasks, delegations, depts, employees, notices, save, logAct, moveToTrash } = useApp();
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFreq, setFilterFreq] = useState('');
  const [filterDelay, setFilterDelay] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [showDetail, setShowDetail] = useState(null);
  const [showDone, setShowDone] = useState(null);
  const [showExtApproval, setShowExtApproval] = useState(null);
  const [tab, setTab] = useState('mine');
  const [showExport, setShowExport] = useState(false);
  const [page, setPage] = useState(1);

  const isMain = currentRole === 'mainadmin';
  const canSeeAll = isMain || hasPerm('all_task_details');
  const canAdd = isMain || hasPerm('tasks_add');
  const canEdit = isMain || hasPerm('tasks_edit');
  const canDel = isMain || hasPerm('tasks_delete');

  // My Tasks = tasks assigned to me OR created by me
  const myTasks = tasks.filter((t) =>
    isAssignedTo(t, currentUser.name) || t.createdBy === currentUser.name
  );

  // Source list depends on tab + permissions
  const sourceList = isMain ? tasks : (canSeeAll && tab === 'all') ? tasks : myTasks;

  const rawFiltered = sourceList.filter((t) => {
    if (search && !t.name.toUpperCase().includes(search.toUpperCase()) && !t.dept.toUpperCase().includes(search.toUpperCase())) return false;
    if (filterDept && t.dept !== filterDept) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterFreq && t.freq !== filterFreq) return false;
    if (filterDelay === 'ontime' && !(t.status === 'done' && !wasCompletedLate(t))) return false;
    if (filterDelay === 'delayed' && !(t.status === 'done' && wasCompletedLate(t))) return false;
    return true;
  }).sort((a, b) => {
    const getTs = (id) => { const m = (id || '').match(/id-(\d{10,13})/); return m ? parseInt(m[1]) : 0; };
    return getTs(b.id) - getTs(a.id);
  });

  // Build a quick lookup for parent resolution
  const taskById = {};
  tasks.forEach(t => { taskById[t.id] = t; });

  const doneSignatures = new Set();
  const seenPendingParents = new Set();
  const filtered = rawFiltered.filter(t => {
    // Hide grandchild tasks (parent also has a parentTaskId) — bug artifacts
    if (t.parentTaskId) {
      const parent = taskById[t.parentTaskId];
      if (parent?.parentTaskId) return false;
    }
    // Deduplicate identical done records (same name+assigned+schedDate+doneTime = true duplicate)
    if (t.status === 'done') {
      const sig = `${t.name}|${(t.assignedTo || []).slice().sort().join(',')}|${t.schedDate}|${t.doneTime}`;
      if (doneSignatures.has(sig)) return false;
      doneSignatures.add(sig);
    }
    // Hide done parent when a pending child exists (child represents the current state)
    if (t.status === 'done') {
      const hasPendingChild = tasks.some(x => x.parentTaskId === t.id && x.status === 'pending');
      if (hasPendingChild) return false;
    }
    // Deduplicate multiple pending siblings (keep only one per parent)
    if (t.status !== 'pending' || !t.parentTaskId) return true;
    if (seenPendingParents.has(t.parentTaskId)) return false;
    seenPendingParents.add(t.parentTaskId);
    return true;
  });

  const paged = paginate(filtered, page);

  // Edit allowed: mainadmin always; others ONLY on tasks they themselves created.
// Even with tasks_edit permission, an employee cannot edit tasks assigned to
// them by someone else. The "my tasks" tab may show tasks assigned to me by
// others (e.g. by the main admin), but the ✏️ button must stay hidden on those.
  const canEditRow = (t) => isMain || (canEdit && t.createdBy === currentUser.name);
  const canDelRow = (t) => isMain || (canDel && tab === 'mine');

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
    await save('hops-tasks', newTasks);
    await logAct(existing ? 'TASK UPDATED' : 'TASK CREATED', obj.name);

    // Sync to delegations table when this is a delegation task (or when the
    // task was previously a delegation task and the freq just changed away
    // from it — in that case the orphan delegation record should be removed).
    const freqChanged = !!existing && existing.freq === 'delegation' && obj.freq !== 'delegation';
    await syncDelegationFromTask(obj, delegations, { save, moveToTrash }, { freqChanged });

    // Send assignment email to newly assigned employees
    const prevAssigned = new Set(existing?.assignedTo || []);
    const newlyAssigned = (obj.assignedTo || []).filter(n => !prevAssigned.has(n));
    if (newlyAssigned.length > 0) {
      const taskType = obj.freq === 'delegation' ? 'Delegation Task' : 'Normal Task';
      const assigneeEmps = employees.filter(e => newlyAssigned.some(n => n.toUpperCase() === e.name.toUpperCase()));
      sendTaskAssignedEmail(obj, assigneeEmps, currentUser.name, taskType);
    }

    setShowForm(false);
    setEditTask(null);
  }

  async function handleDone({ remark, delayReason, isDelayed }) {
    const t = showDone;
    const now = new Date();
    const nowStr = now.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
    const updated = {
      ...t, status: 'done', doneBy: currentUser.name, doneTime: nowStr,
      doneRemark: remark, delayReason, isDelayed, lastDone: toDay(),
      activityLog: [...(t.activityLog || []), { by: currentUser.name, action: 'COMPLETED' + (isDelayed ? ' (DELAYED)' : ''), details: remark, at: nowStr }],
    };
    const newTasks = tasks.map((x) => x.id === t.id ? updated : x);
    await save('hops-tasks', newTasks);
    await logAct('TASK COMPLETED', t.name + (isDelayed ? ' [DELAYED]' : ''));
    // Mirror completion into hops-delegations so the Delegation Tracker page
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
    await moveToTrash('task', task.id);
    // Mirror the deletion: if this was a delegation task, drop the matching
    // delegation record too so the Delegation Tracker page doesn't keep
    // showing it as a ghost entry.
    if (task.freq === 'delegation') {
      const target = delegations.find((d) => d.id === task.id);
      if (target) {
        try { await moveToTrash('delegation', task.id); } catch (e) { /* non-fatal */ }
      }
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
    await save('hops-tasks', newTasks);
    await logAct(`DELEGATION EXTENSION ${decision.toUpperCase()}`, task.name);
    // If the extension was approved on a delegation task, push it to the
    // delegation record so the workflow page reflects the new due date.
    if (task.freq === 'delegation' && approvedExt) {
      const next = delegations.map((d) =>
        d.id === task.id
          ? { ...d, dueDate: approvedExt.newDate, expDate: approvedExt.newDate, status: 'extended', updatedAt: new Date().toISOString() }
          : d
      );
      try { await save('hops-delegations', next); } catch (e) { /* non-fatal */ }
    }
    setShowExtApproval(updated);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>Manage Tasks</h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => setShowExport(true)} style={{ ...BtnS, background: '#1a7a4a' }}>⬇ Export</button>
          <button onClick={() => window.print()} style={{ ...BtnS, background: '#334155' }}>🖨 Print</button>
          {canAdd && <button onClick={() => { setEditTask(null); setShowForm(true); }} style={{ ...BtnS, background: '#0d7377' }}>＋ New Task</button>}
        </div>
      </div>

      {/* Tabs — only show if user has all_task_details perm */}
      {canSeeAll && !isMain && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <button onClick={() => setTab('mine')} style={{ padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, background: tab === 'mine' ? '#0d7377' : '#f3f7fc', color: tab === 'mine' ? 'white' : '#1a2535' }}>
            📋 My Tasks ({myTasks.length})
          </button>
          <button onClick={() => setTab('all')} style={{ padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, background: tab === 'all' ? '#0b1e3d' : '#f3f7fc', color: tab === 'all' ? 'white' : '#1a2535' }}>
            🗂 All Task Details ({tasks.length})
          </button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 12, pointerEvents: 'none' }}>🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="SEARCH..." style={{ ...IS, paddingLeft: 30, width: '100%' }} />
        </div>
        <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} style={{ ...IS, width: 'auto' }}>
          <option value="">ALL DEPTS</option>
          {depts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ ...IS, width: 'auto' }}>
          <option value="">ALL STATUS</option>
          <option value="pending">PENDING</option>
          <option value="done">DONE</option>
        </select>
        <select value={filterFreq} onChange={(e) => setFilterFreq(e.target.value)} style={{ ...IS, width: 'auto' }}>
          <option value="">ALL FREQ</option>
          {FREQ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={filterDelay} onChange={(e) => setFilterDelay(e.target.value)} style={{ ...IS, width: 'auto' }}>
          <option value="">ALL</option>
          <option value="ontime">ON TIME</option>
          <option value="delayed">DELAYED</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Assign Date', 'Status', 'Task', 'Dept', 'Assigned', 'Frequency', 'Sched. Date', 'Completion', 'Actions'].map((h) => (
                  <th key={h} style={{ background: '#f3f7fc', padding: '9px 13px', textAlign: 'left', fontSize: 10.5, fontWeight: 800, color: '#6b7a90', letterSpacing: 0.8, textTransform: 'uppercase', borderBottom: '1px solid #d8e2ef' }}>{h}</th>
                ))}
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
                      {isDone && !late ? <span style={{ background: '#d4edda', color: '#155724', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>✅ ON TIME</span>
                        : isDone && late ? <span style={{ background: '#ede9fe', color: '#4c1d95', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>⏰ DELAYED</span>
                        : t.priority === 'high' ? <span style={{ background: '#fde8e8', color: '#7d1a1a', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>⚠️ PENDING</span>
                        : <span style={{ background: '#fff3cd', color: '#7a4800', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>⏳ PENDING</span>}
                    </td>
                    <td style={{ padding: '11px 13px', verticalAlign: 'middle' }}>
                      <strong>{t.name}</strong>
                      {t.assignedTo?.length ? <div style={{ fontSize: 10.5, color: '#1a56db' }}>👤 {t.assignedTo.join('+')}</div> : null}
                      {t.createdBy && <div style={{ fontSize: 10.5, color: '#6b7a90' }}>📌 By: {t.createdBy}</div>}
                    </td>
                    <td style={{ padding: '11px 13px', verticalAlign: 'middle' }}><DeptTag name={t.dept} /></td>
                    <td style={{ padding: '11px 13px', verticalAlign: 'middle', fontSize: 12 }}>{t.assignedTo?.join(', ') || '—'}</td>
                    <td style={{ padding: '11px 13px', verticalAlign: 'middle' }}><FreqBadge freq={t.freq} /></td>
                    <td style={{ padding: '11px 13px', verticalAlign: 'middle', fontSize: 12, color: '#0d7377', fontWeight: 700 }}>
                      {t.schedDate ? fDate(t.schedDate) : '—'}
                      {t.time && <div style={{ fontSize: 11 }}>⏰ {t.time}</div>}
                    </td>
                    <td style={{ padding: '11px 13px', verticalAlign: 'middle', fontSize: 11 }}>
                      {t.doneBy ? <><strong>{t.doneBy}</strong><br /><span style={{ color: '#0d7377' }}>{t.doneTime || ''}</span></> : '—'}
                    </td>
                    <td style={{ padding: '11px 13px', verticalAlign: 'middle' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
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
                <tr><td colSpan={9}><EmptyState icon="📋" message="NO TASKS FOUND" /></td></tr>
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
            'Status': t.status === 'done' ? (wasCompletedLate(t) ? 'Delayed' : 'On Time') : 'Pending',
            'Done By': t.doneBy || '—',
            'Done Time': t.doneTime || '—',
            'Delay Reason': t.delayReason || '—',
          })), `Tasks_${from}_to_${to}`);
        }}
      />
    </div>
  );
}
