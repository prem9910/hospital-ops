import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { toDay, fDate, fDateTime, wasCompletedLate, exportToExcel } from '../utils';
import { PRIORITY_OPTIONS } from '../constants';
import { Modal } from '../components/common/Modal';
import { DeptTag, PriorityBadge, FreqBadge } from '../components/common/Badge';
import { EmptyState } from '../components/common/Alert';
import { FilterPopup, FilterField, FP_INPUT, ChipButton } from '../components/common/FilterPopup';

// Read-only task detail modal — same shape as Tasks.jsx TaskDetailModal but
// with NO edit/delete/mark-complete buttons for employees. For main admin
// only, an inline "Edit" button opens the EditFormModal so admins can fix
// delegation tasks without leaving this page.
function TaskViewModal({ task, open, onClose, canEdit, onEdit }) {
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

      {/* Footer — main admin gets an inline Edit button. Staff sees nothing. */}
      {canEdit && (
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={() => onEdit(task)} style={{ padding: '9px 16px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
            ✏️ Edit Task
          </button>
        </div>
      )}
    </Modal>
  );
}

// Inline edit modal — main admin only. Mirrors Tasks.jsx TaskFormModal's
// shape (same fields, same IS style) so admins don't need to jump pages to
// fix a delegation task. Saves via the AppContext save() flow; auto-sync to
// workdesk-delegations happens on the Tasks.jsx side via the same id.
function EditFormModal({ open, onClose, onSave, editTask, depts, employees }) {
  const blank = { name: '', dept: '', freq: 'delegation', assignedTo: [], assigneeEmails: [], schedDate: '', time: '', priority: 'medium', notes: '' };
  const [form, setForm] = useState(blank);

  function reset(t) {
    setForm(t ? {
      name: t.name, dept: t.dept, freq: 'delegation',  // delegation tasks always stay delegation
      assignedTo: t.assignedTo || [], assigneeEmails: t.assigneeEmails || [],
      schedDate: t.schedDate || '', time: t.time || '',
      priority: t.priority || 'medium', notes: t.notes || '',
    } : blank);
  }

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
    <Modal open={open} onClose={() => { onClose(); reset(null); }} title="✏️ Edit Delegation Task">
      {/* Task Name */}
      <Field label="Task Name *">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toUpperCase() })} placeholder="E.G. FILE RENEWAL DOCUMENTS" style={IS} autoFocus />
      </Field>

      {/* Dept row — freq is fixed at 'delegation' for this page */}
      <Field label="Department *">
        <select value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value, assignedTo: [], assigneeEmails: [] })} style={IS}>
          <option value="">Select department...</option>
          {depts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
      </Field>

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
          <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} style={IS} />
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
        <button onClick={handleSave} style={{ ...BtnS, background: '#0d7377' }}>💾 Save Edit</button>
        <button onClick={() => { onClose(); reset(null); }} style={{ ...BtnS, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377' }}>Cancel</button>
      </div>
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

const IS = { width: '100%', padding: '9px 13px', borderRadius: 8, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 13, color: '#1a2535', outline: 'none', background: 'white', fontWeight: 600 };
const BtnS = { padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13, color: 'white', fontFamily: "'Nunito',sans-serif" };
function Field({ label, children }) {
  return <div style={{ marginBottom: 13 }}><label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</label>{children}</div>;
}

export default function DelegationTasks() {
  const { currentUser, currentRole, hasPerm } = useAuth();
  const { tasks, delegations, depts, employees, save, logAct } = useApp();
  const [filter, setFilter] = useState('all');  // 'all' | 'pending' | 'done'
  const [search, setSearch] = useState('');
  const [viewTask, setViewTask] = useState(null);
  const [editTask, setEditTask] = useState(null);

  const isMain = currentRole === 'mainadmin';
  // Page-level permission: anyone with delegation_view can see this page,
  // but only main admin gets the inline Edit button. Employees get a true
  // read-only view — no edit, no delete.
  const canManageTasks = isMain;

  // Source: tasks where freq === 'delegation'. Sorted most-recent-first.
  const delegationTasks = useMemo(() => {
    const arr = (tasks || []).filter((t) => t.freq === 'delegation');
    return arr.sort((a, b) => {
      const ka = a.updatedAt || a.lastDone || a.schedDate || a.created || '';
      const kb = b.updatedAt || b.lastDone || b.schedDate || b.created || '';
      return kb.localeCompare(ka);
    });
  }, [tasks]);

  // Apply status + search filters on top of the delegation slice
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return delegationTasks
      .filter((t) => {
        if (filter === 'pending') return t.status !== 'done';
        if (filter === 'done') return t.status === 'done';
        return true;
      })
      .filter((t) => !q || (t.name || '').toLowerCase().includes(q) || (t.assignedTo || []).some((n) => n.toLowerCase().includes(q)) || (t.dept || '').toLowerCase().includes(q));
  }, [delegationTasks, filter, search]);

  const pendingCount = delegationTasks.filter((t) => t.status !== 'done').length;
  const doneCount = delegationTasks.filter((t) => t.status === 'done').length;

  // Edit handler — same shape as Tasks.jsx handleSave so the auto-sync
  // helpers there (taskToDelegation + syncDelegationFromTask) keep the
  // workdesk-delegations record in lockstep. We inline the body here instead
  // of importing from Tasks.jsx so the page stays self-contained.
  async function handleEditSave(form) {
    if (!editTask) return;
    const obj = {
      ...editTask,
      name: form.name, dept: form.dept, freq: 'delegation',
      assignedTo: form.assignedTo, assigneeEmails: form.assigneeEmails,
      schedDate: form.schedDate, time: form.time, priority: form.priority,
      notes: form.notes,
      activityLog: [...(editTask.activityLog || []), { by: currentUser.name, action: 'EDITED', details: '', at: fDateTime() }],
    };
    const newTasks = tasks.map((t) => t.id === obj.id ? obj : t);
    await save('workdesk-tasks', newTasks);
    await logAct('DELEGATION TASK UPDATED', obj.name);

    // Mirror the edit into workdesk-delegations so the Delegation Tracker page
    // and dashboard drill-down reflect the same name/dept/due date/etc.
    // Build the same shape Tasks.jsx's taskToDelegation produces, then
    // upsert by id. We deliberately do NOT remove the record if something
    // weird happens — the record's source-of-truth is still the task.
    const status = obj.status === 'done' ? 'done' : 'pending';
    const mirror = {
      id: obj.id,
      task: obj.name || '',
      taskName: obj.name || '',
      doerId: '',
      doerName: (obj.assignedTo || [])[0] || '',
      dept: obj.dept || '',
      priority: obj.priority || 'medium',
      dueDate: obj.schedDate || '',
      expDate: obj.schedDate || '',
      remarks: obj.notes || '',
      notes: obj.notes || '',
      status,
      createdBy: obj.createdBy || '',
      createdAt: obj.created || toDay(),
      actualDate: obj.lastDone || '',
      actualTime: obj.doneTime || '',
      doneRemark: obj.doneRemark || '',
      delayReason: obj.delayReason || '',
      isDelayed: !!obj.isDelayed,
      extensionRequests: [],
      updatedAt: new Date().toISOString(),
    };
    const idx = delegations.findIndex((d) => d.id === obj.id);
    const next = idx >= 0
      ? delegations.map((d, i) => i === idx ? mirror : d)
      : [...delegations, mirror];
    await save('workdesk-delegations', next);

    setEditTask(null);
    setViewTask(null);
  }

  function handleExport() {
    try {
      const data = rows.map((t) => {
        // Build the row as plain object with explicit string values.
        // Some Excel parsers drop cells that contain undefined / null /
        // functions / symbols, so we coerce every value to a string first.
        // This guarantees every cell renders as text in the xlsx file.
        const safeStr = (v) => {
          if (v === undefined || v === null) return '';
          if (typeof v === 'function' || typeof v === 'symbol') return '';
          if (Array.isArray(v)) return v.filter((x) => x != null).join(', ');
          return String(v);
        };
        return {
          'Task Name': safeStr(t.name),
          'Department': safeStr(t.dept),
          'Priority': safeStr(t.priority).toUpperCase(),
          'Status': t.status === 'done' ? 'DONE' : 'PENDING',
          'Doer': Array.isArray(t.assignedTo) ? t.assignedTo.filter((x) => x != null).join(', ') : '',
          'Scheduled Date': safeStr(t.schedDate),
          'Time': safeStr(t.time),
          'Done By': safeStr(t.doneBy),
          'Done Time': safeStr(t.doneTime),
          'Remark': safeStr(t.doneRemark),
          'Delay Reason': safeStr(t.delayReason),
          'Created By': safeStr(t.createdBy),
          'Created': safeStr(t.created),
          'Notes': safeStr(t.notes),
        };
      });
      console.log('[DelegationTasks] export', { rowCount: rows.length, dataCount: data.length, sample: data[0] });
      if (!data.length) {
        alert('No delegation tasks to export.');
        return;
      }
      exportToExcel(data, `delegation-tasks-${toDay()}`);
    } catch (e) {
      console.error('[DelegationTasks] export failed', e);
      alert('Excel export failed: ' + (e?.message || e));
    }
  }

  const IS_BTN = { padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, color: 'white' };
  const TD = { padding: '9px 12px', verticalAlign: 'middle', fontSize: 12 };
  const TH = { background: '#f3f7fc', padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#6b7a90', letterSpacing: 0.7, textTransform: 'uppercase', borderBottom: '1px solid #d8e2ef', whiteSpace: 'nowrap' };

  return (
    <div>
      {/* Header — counts on the left, action buttons on the right */}
      <div className="page-header">
        <div className="page-header-title">
          <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d', marginBottom: 4 }}>📋 Delegation Tasks</h2>
          <div style={{ fontSize: 12, color: '#6b7a90' }}>
            <strong style={{ color: '#0d7377' }}>{delegationTasks.length}</strong> total task{delegationTasks.length === 1 ? '' : 's'}
            {' • '}
            <strong style={{ color: '#d4920a' }}>{pendingCount}</strong> pending
            {' • '}
            <strong style={{ color: '#1a7a4a' }}>{doneCount}</strong> done
          </div>
        </div>
        <div className="page-header-actions">
          <button onClick={handleExport} disabled={!rows.length} style={{ ...IS_BTN, background: rows.length ? '#1a7a4a' : '#9ca3af', cursor: rows.length ? 'pointer' : 'not-allowed' }}>
            ⬇ Excel
          </button>
          <button onClick={() => window.print()} disabled={!rows.length} style={{ ...IS_BTN, background: rows.length ? '#334155' : '#9ca3af', cursor: rows.length ? 'pointer' : 'not-allowed' }}>
            🖨 Print
          </button>
        </div>
      </div>

      {/* Filter popup — search + status (all/pending/done). Status
          uses a chip row so it's tappable on touch and acts as a
          radio group instead of a dropdown. */}
      <FilterPopup
        activeCount={(search ? 1 : 0) + (filter !== 'all' ? 1 : 0)}
        onClear={() => { setSearch(''); setFilter('all'); }}
      >
        <FilterField label="Search">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="SEARCH TASK / DOER / DEPT..." style={FP_INPUT} autoFocus />
        </FilterField>
        <FilterField label="Status">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <ChipButton active={filter === 'all'} onClick={() => setFilter('all')}>{`ALL (${delegationTasks.length})`}</ChipButton>
            <ChipButton active={filter === 'pending'} onClick={() => setFilter('pending')}>{`⏳ PENDING (${pendingCount})`}</ChipButton>
            <ChipButton active={filter === 'done'} onClick={() => setFilter('done')}>{`✅ DONE (${doneCount})`}</ChipButton>
          </div>
        </FilterField>
      </FilterPopup>

      {/* Table */}
      {rows.length ? (
        <div style={{ background: 'white', border: '1px solid #d8e2ef', borderRadius: 9, overflow: 'hidden', maxHeight: '62vh', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                {['Task', 'Doer', 'Dept', 'Status', 'Sched Date', 'Created', 'Action'].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const isDone = t.status === 'done';
                const late = isDone && wasCompletedLate(t);
                return (
                  <tr key={t.id} style={{ background: late ? '#faf5ff' : (isDone ? '#f8fbf8' : 'white'), borderBottom: '1px solid #f3f7fc' }}>
                    <td style={{ ...TD, fontWeight: 700, maxWidth: 280 }}>
                      {t.name}
                      {t.priority === 'high' && !isDone && (
                        <span style={{ marginLeft: 6, fontSize: 9, color: '#c0392b', fontWeight: 800 }}>🔴 HIGH</span>
                      )}
                    </td>
                    <td style={{ ...TD, fontSize: 11 }}>
                      {(t.assignedTo || []).length
                        ? <span style={{ color: '#0b1e3d', fontWeight: 700 }}>{(t.assignedTo || []).join(', ')}</span>
                        : <span style={{ color: '#6b7a90' }}>—</span>}
                    </td>
                    <td style={TD}><DeptTag name={t.dept} /></td>
                    <td style={TD}>
                      {isDone
                        ? (late
                          ? <span style={{ background: '#ede9fe', color: '#4c1d95', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 800 }}>⏰ DELAYED</span>
                          : <span style={{ background: '#d4edda', color: '#155724', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 800 }}>✅ DONE</span>)
                        : <span style={{ background: '#fff3cd', color: '#7a4800', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 800 }}>⏳ PENDING</span>}
                    </td>
                    <td style={{ ...TD, color: '#0d7377', fontWeight: 700, whiteSpace: 'nowrap' }}>{t.schedDate ? fDate(t.schedDate) : '—'}</td>
                    <td style={{ ...TD, fontSize: 11, color: '#6b7a90' }}>{t.created ? fDate(t.created) : '—'}</td>
                    <td style={TD}>
                      <button onClick={() => setViewTask(t)} style={{ padding: '5px 12px', borderRadius: 7, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>
                        👁 View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #d8e2ef', borderRadius: 9, padding: 30 }}>
          <EmptyState icon="📋" message={delegationTasks.length === 0 ? 'NO DELEGATION TASKS YET' : 'NO TASKS MATCH THE SELECTED FILTERS'} />
          {delegationTasks.length === 0 && (
            <div style={{ textAlign: 'center', fontSize: 11.5, color: '#6b7a90', marginTop: 6 }}>
              Tasks with <strong>Frequency = Delegation</strong> created from the <strong>Manage Tasks</strong> page will appear here.
            </div>
          )}
        </div>
      )}

      {/* Read-only detail modal (with optional Edit button for main admin) */}
      <TaskViewModal
        task={viewTask}
        open={!!viewTask}
        onClose={() => setViewTask(null)}
        canEdit={canManageTasks}
        onEdit={(t) => { setViewTask(null); setEditTask(t); }}
      />

      {/* Inline edit modal — main admin only */}
      <EditFormModal
        open={!!editTask}
        onClose={() => setEditTask(null)}
        onSave={handleEditSave}
        editTask={editTask}
        depts={depts}
        employees={employees}
      />
    </div>
  );
}
