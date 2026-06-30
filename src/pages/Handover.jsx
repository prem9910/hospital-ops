import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { uid, toDay, fDate, notifyAdmins, exportToExcel } from '../utils';
import { DeptTag, PriorityBadge } from '../components/common/Badge';
import { EmptyState } from '../components/common/Alert';
import { Pagination, paginate } from '../components/common/Pagination';
import { sendHandoverCreatedEmail } from '../lib/emailService';

const IS = { width: '100%', padding: '9px 13px', borderRadius: 8, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 13, color: '#1a2535', outline: 'none', background: 'white', fontWeight: 600 };
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

function handoverStatus(h) {
  const today = toDay();
  if (!h.dateStart) return h.status || 'old';
  if (today < h.dateStart) return 'upcoming';
  if (today > h.dateEnd) return 'completed';
  return 'active';
}

const STATUS_CFG = {
  active:    { label: '🟢 ACTIVE',      bg: '#d4edda', color: '#155724', border: '#86efac' },
  upcoming:  { label: '🔵 UPCOMING',    bg: '#cfe2ff', color: '#0a3870', border: '#93c5fd' },
  completed: { label: '✅ COMPLETED',   bg: '#e4eaf2', color: '#4a5568', border: '#d8e2ef' },
  old:       { label: '📋 OLD RECORD',  bg: '#f3f7fc', color: '#6b7a90', border: '#e4eaf2' },
  pending:   { label: '⏳ PENDING',     bg: '#fff3cd', color: '#7a4800', border: '#f5c842' },
  accepted:  { label: '✅ ACCEPTED',    bg: '#d4edda', color: '#155724', border: '#86efac' },
  rejected:  { label: '❌ REJECTED',    bg: '#fde8e8', color: '#c0392b', border: '#f87171' },
  cancelled: { label: '🚫 CANCELLED',   bg: '#f3f7fc', color: '#6b7a90', border: '#d8e2ef' },
};

export default function Handover() {
  const { currentRole, currentUser, hasPerm } = useAuth();
  const { tasks, handovers, depts, employees, notices, save, logAct, moveToTrash } = useApp();

  const [filterDept, setFilterDept] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [msg, setMsg] = useState('');

  // Email popup — when recipient has no email
  const [emailPopup, setEmailPopup] = useState(null); // { emp, handoverObj }
  const [popupEmail, setPopupEmail] = useState('');

  const isMain = currentRole === 'mainadmin';
  const canCreate = isMain || hasPerm('handover_view');
  const canEditDelete = isMain;

  const defaultForm = { fromName: currentUser.name.toUpperCase(), toName: '', dept: currentUser.dept || '', dateStart: toDay(), dateEnd: '', notes: '' };
  const [form, setForm] = useState(defaultForm);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [page, setPage] = useState(1);

  // Department filters for the form dropdowns
  const [fromDept, setFromDept] = useState(''); // admin only: filter "Handover From" list
  const [toDept, setToDept] = useState('');     // both: filter "Handover To" list

  // Pending tasks of the selected "from" employee
  const fromEmployee = employees.find(e => e.name.toUpperCase() === (form.fromName || '').toUpperCase());
  const fromEmpName = fromEmployee?.name || form.fromName;
  const eligibleTasks = tasks.filter(t =>
    t.assignedTo?.some(n => n.toUpperCase() === (form.fromName || '').toUpperCase()) &&
    t.status === 'pending'
  );

  // Filtered employee lists for the form
  const fromEmpList = employees.filter(e => !fromDept || e.dept === fromDept);
  const toEmpList = employees.filter(e =>
    (!toDept || e.dept === toDept) &&
    e.name.toUpperCase() !== (form.fromName || '').toUpperCase()
  );

  function toggleTask(id) {
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleAll() {
    setSelectedIds(selectedIds.size === eligibleTasks.length ? new Set() : new Set(eligibleTasks.map(t => t.id)));
  }

  function openEditForm(h) {
    setForm({
      fromName: h.fromName || '',
      toName: h.toName || '',
      dept: h.dept || '',
      dateStart: h.dateStart || toDay(),
      dateEnd: h.dateEnd || '',
      notes: h.notes || '',
    });
    const fromEmp = employees.find(e => e.name.toUpperCase() === (h.fromName || '').toUpperCase());
    const toEmp = employees.find(e => e.name.toUpperCase() === (h.toName || '').toUpperCase());
    setFromDept(fromEmp?.dept || '');
    setToDept(toEmp?.dept || '');
    setSelectedIds(new Set(h.taskIds || []));
    setEditingId(h.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    setForm(defaultForm);
    setFromDept('');
    setToDept('');
    setSelectedIds(new Set());
    setEditingId(null);
    setShowForm(false);
    setMsg('');
  }

  async function handleSubmit() {
    if (!form.toName) { setMsg('❌ Handover To required!'); return; }
    if (!form.dateStart || !form.dateEnd) { setMsg('❌ Start and End date required!'); return; }
    if (form.dateEnd < form.dateStart) { setMsg('❌ End date must be after start date!'); return; }
    if (selectedIds.size === 0) { setMsg('❌ Please select at least 1 task!'); return; }
    if (saving) return;
    setSaving(true);
    try {
      if (editingId) {
        // Edit existing
        const updated = handovers.map(h => h.id === editingId ? {
          ...h,
          fromName: form.fromName.toUpperCase(),
          toName: form.toName.toUpperCase(),
          dept: form.dept,
          dateStart: form.dateStart,
          dateEnd: form.dateEnd,
          notes: form.notes,
          taskIds: [...selectedIds],
          updatedAt: new Date().toISOString(),
        } : h);
        await save('workdesk-handovers', updated);
        await logAct('HANDOVER EDITED', `${form.fromName} → ${form.toName} | ${selectedIds.size} tasks`);
        setMsg('✅ Handover updated successfully!');
      } else {
        // New
        const obj = {
          id: uid(),
          fromName: form.fromName.toUpperCase(),
          toName: form.toName.toUpperCase(),
          dept: form.dept,
          dateStart: form.dateStart,
          dateEnd: form.dateEnd,
          notes: form.notes,
          taskIds: [...selectedIds],
          status: 'pending',
          createdAt: new Date().toISOString(),
          createdBy: currentUser.name,
        };
        await save('workdesk-handovers', [...handovers, obj]);
        await logAct('HANDOVER CREATED', `${obj.fromName} → ${obj.toName} | ${obj.taskIds.length} tasks | ${obj.dateStart} to ${obj.dateEnd}`);
        // Notify main admin bell (skip if main admin is the creator — no self-notification)
        if (currentRole !== 'mainadmin') {
          try {
            await notifyAdmins({
              notices, save,
              subject: `🔄 Handover created: ${obj.fromName} → ${obj.toName}`,
              message: `From: ${obj.fromName}\nTo: ${obj.toName}\nTasks: ${obj.taskIds.length}\nDuration: ${obj.dateStart} → ${obj.dateEnd}\n${obj.notes ? 'Notes: ' + obj.notes : ''}`,
              type: 'handover_request',
              meta: { handoverId: obj.id, fromName: obj.fromName, toName: obj.toName, taskCount: obj.taskIds.length },
            });
          } catch (e) { console.error('Admin notify failed:', e); }
        }
        setMsg('✅ Handover created successfully! The recipient must accept or reject it.');

        // Email to recipient (toName)
        const toEmp = employees.find(e => e.name.trim().toUpperCase() === obj.toName.trim().toUpperCase());
        if (toEmp?.email) {
          try {
            await sendHandoverCreatedEmail(obj, toEmp);
            setMsg('✅ Handover created successfully! 📧 Email notification sent.');
          } catch {
            setMsg('✅ Handover created successfully! ⚠️ Email could not be sent — please check the server.');
          }
        } else {
          // No email in system — show popup to collect it
          setEmailPopup({ emp: toEmp || { name: obj.toName, id: null }, handoverObj: obj });
          setPopupEmail('');
          return;
        }
      }
      resetForm();
    } finally { setSaving(false); }
  }

  async function handlePopupSend() {
    if (!popupEmail.trim() || !popupEmail.includes('@')) { alert('Please enter a valid email address!'); return; }
    const { emp, handoverObj } = emailPopup;
    // Save email to employee record
    const updatedEmps = employees.map(e => e.id === emp.id ? { ...e, email: popupEmail.trim() } : e);
    await save('workdesk-employees', updatedEmps);
    sendHandoverCreatedEmail(handoverObj, { ...emp, email: popupEmail.trim() });
    setEmailPopup(null);
    resetForm();
  }

  async function cancelHandover(h) {
    if (!window.confirm('Are you sure you want to cancel this handover?')) return;
    // Edge case: if the recipient had already accepted and the handover
    // window is current, the tasks may have been reassigned to the new
    // owner in the tasks table. Cancelling should restore the original
    // owner for any tasks that haven't been done yet — otherwise the
    // tasks are stranded with no clear owner.
    if (h.status === 'accepted' && h.fromName && h.toName) {
      const originalOwner = h.fromName.toUpperCase();
      const newOwner = h.toName.toUpperCase();
      const taskIds = h.taskIds || [];
      const updatedTasks = tasks.map((t) => {
        if (!taskIds.includes(t.id)) return t;
        if (t.status === 'done') return t; // done tasks keep whoever did them
        const assigned = (t.assignedTo || []).map((n) => (n.toUpperCase() === newOwner ? originalOwner : n));
        // De-duplicate (in case original owner was already in the list)
        const deduped = [...new Set(assigned)];
        return { ...t, assignedTo: deduped };
      });
      await save('workdesk-tasks', updatedTasks);
    }
    await save('workdesk-handovers', handovers.map(x => x.id === h.id ? { ...x, status: 'cancelled' } : x));
    await logAct('HANDOVER CANCELLED', `${h.fromName} → ${h.toName}${h.status === 'accepted' ? ' (tasks restored to original owner)' : ''}`);
  }

  const today = toDay();

  const filtered = handovers
    .filter(h => {
      if (filterDept && h.dept !== filterDept) return false;
      if (filterStatus) {
        if (filterStatus === 'pending_accept') return h.status === 'pending';
        if (filterStatus === 'accepted') return h.status === 'accepted';
        if (filterStatus === 'rejected') return h.status === 'rejected';
        const st = handoverStatus(h);
        if (st !== filterStatus) return false;
      }
      return true;
    })
    .sort((a, b) => (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || ''));

  const activeCount = handovers.filter(h => h.status === 'accepted' && handoverStatus(h) === 'active').length;
  const paged = paginate(filtered, page);
  const upcomingCount = handovers.filter(h => h.status === 'accepted' && handoverStatus(h) === 'upcoming').length;
  const pendingAcceptCount = handovers.filter(h => h.status === 'pending').length;

  return (
    <div>

      {/* ── Email Popup ── */}
      {emailPopup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 28, maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 28, marginBottom: 8, textAlign: 'center' }}>📧</div>
            <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: '#0b1e3d', margin: '0 0 6px', textAlign: 'center' }}>Email ID Missing</h3>
            <p style={{ fontSize: 13, color: '#4a5568', textAlign: 'center', marginBottom: 18 }}>
              <strong>{emailPopup.emp.name}</strong> does not have an email address on file.<br />
              Enter an email address to send the handover notification:
            </p>
            <input
              type="email"
              value={popupEmail}
              onChange={e => setPopupEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePopupSend()}
              placeholder="employee@email.com"
              autoFocus
              style={{ width: '100%', padding: '10px 13px', borderRadius: 8, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 13, color: '#1a2535', outline: 'none', boxSizing: 'border-box', marginBottom: 14 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handlePopupSend} style={{ flex: 1, padding: '9px 0', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>📨 Save & Send Email</button>
              <button onClick={() => { setEmailPopup(null); resetForm(); }} style={{ padding: '9px 14px', borderRadius: 8, background: 'transparent', color: '#6b7a90', border: '1.5px solid #d8e2ef', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Skip</button>
            </div>
            <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 10, marginBottom: 0 }}>The email will also be saved to the employee's record</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <h2 className="page-header-title" style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>🔄 Handover Register</h2>
        <div className="page-header-actions" style={{ alignItems: 'center' }}>
          {pendingAcceptCount > 0 && <span style={{ background: '#fff3cd', color: '#7a4800', padding: '4px 12px', borderRadius: 20, fontSize: 11.5, fontWeight: 800, border: '1px solid #f5c842' }}>⏳ {pendingAcceptCount} Pending Accept</span>}
          {activeCount > 0 && <span style={{ background: '#d4edda', color: '#155724', padding: '4px 12px', borderRadius: 20, fontSize: 11.5, fontWeight: 800 }}>🟢 {activeCount} Active</span>}
          {upcomingCount > 0 && <span style={{ background: '#cfe2ff', color: '#0a3870', padding: '4px 12px', borderRadius: 20, fontSize: 11.5, fontWeight: 800 }}>🔵 {upcomingCount} Upcoming</span>}
          <button onClick={() => exportToExcel(handovers.map(h => ({ From: h.fromName, To: h.toName, Department: h.dept, 'Start Date': h.dateStart, 'End Date': h.dateEnd, Status: h.status, Notes: h.notes || '', Tasks: (h.taskIds || []).length, 'Done By': (h.taskIds || []).filter(id => { const t = tasks.find(x => x.id === id); return t && t.status === 'done'; }).length })), 'handovers-export')} style={{ padding: '8px 14px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>⬇ Export</button>
          <button onClick={() => window.print()} style={{ padding: '8px 14px', borderRadius: 8, background: '#334155', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>🖨 Print</button>
          {canCreate && (
            <button onClick={() => { showForm ? resetForm() : setShowForm(true); setMsg(''); }} style={{ padding: '8px 16px', borderRadius: 8, background: showForm ? '#e4eaf2' : '#0d7377', color: showForm ? '#1a2535' : 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
              {showForm ? '✕ Cancel' : '+ New Handover'}
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 9, background: msg.startsWith('✅') ? '#d4edda' : '#fde8e8', color: msg.startsWith('✅') ? '#1a7a4a' : '#c0392b', fontWeight: 700, fontSize: 13 }}>
          {msg}
        </div>
      )}

      {/* ── New / Edit Handover Form ── */}
      {showForm && canCreate && (
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #d8e2ef', padding: 22, marginBottom: 22 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, color: '#0b1e3d', marginBottom: 14 }}>
            {editingId ? '✏️ Edit Handover' : '📋 New Handover'}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4 }}>
            {isMain ? (
              <>
                {/* Admin: From Department → From Employee */}
                <Field label="From Department *">
                  <select value={fromDept} onChange={e => { setFromDept(e.target.value); setForm(f => ({ ...f, fromName: '' })); setSelectedIds(new Set()); }} style={IS}>
                    <option value="">Select Department...</option>
                    {depts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                  </select>
                </Field>
                {/* Admin: To Department → To Employee */}
                <Field label="To Department *">
                  <select value={toDept} onChange={e => { setToDept(e.target.value); setForm(f => ({ ...f, toName: '' })); }} style={IS}>
                    <option value="">Select Department...</option>
                    {depts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                  </select>
                </Field>
                <Field label="Handover From *">
                  <select value={form.fromName} onChange={e => { setForm(f => ({ ...f, fromName: e.target.value })); setSelectedIds(new Set()); }} style={IS} disabled={!fromDept}>
                    <option value="">{fromDept ? 'Select Employee...' : 'Select a department first'}</option>
                    {fromEmpList.map(e => <option key={e.id} value={e.name.toUpperCase()}>{e.name}</option>)}
                  </select>
                </Field>
                <Field label="Handover To *">
                  <select value={form.toName} onChange={e => setForm(f => ({ ...f, toName: e.target.value }))} style={IS} disabled={!toDept}>
                    <option value="">{toDept ? 'Select Employee...' : 'Select a department first'}</option>
                    {toEmpList.map(e => <option key={e.id} value={e.name.toUpperCase()}>{e.name}</option>)}
                  </select>
                </Field>
              </>
            ) : (
              <>
                {/* Employee: Handover From fixed (full width) */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Handover From">
                    <input value={form.fromName} disabled style={{ ...IS, background: '#f5f8fc', color: '#6b7a90' }} />
                  </Field>
                </div>

                {/* Handover To section with heading */}
                <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #e8eef5', paddingTop: 14, marginTop: 2 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#0d7377', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
                    📤 Handover To — Select department first, then employee
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Field label="Department *">
                      <select value={toDept} onChange={e => { setToDept(e.target.value); setForm(f => ({ ...f, toName: '' })); }} style={IS}>
                        <option value="">Select Department...</option>
                        {depts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Employee *">
                      <select value={form.toName} onChange={e => setForm(f => ({ ...f, toName: e.target.value }))} style={IS} disabled={!toDept}>
                        <option value="">{toDept ? 'Select Employee...' : 'Select a department first'}</option>
                        {toEmpList.map(e => <option key={e.id} value={e.name.toUpperCase()}>{e.name}</option>)}
                      </select>
                    </Field>
                  </div>
                </div>
              </>
            )}
            <Field label="Date Start *">
              <input type="date" value={form.dateStart} min={isMain ? undefined : toDay()} onChange={e => setForm({ ...form, dateStart: e.target.value })} style={IS} />
            </Field>
            <Field label="Date End *">
              <input type="date" value={form.dateEnd} min={form.dateStart || toDay()} onChange={e => setForm({ ...form, dateEnd: e.target.value })} style={IS} />
            </Field>
          </div>

          <Field label="Handover Notes / Reason">
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Reason (leave, training, emergency...)" style={{ ...IS, minHeight: 70, resize: 'vertical' }} />
          </Field>

          {/* Task selection */}
          <div style={{ marginTop: 4 }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: '#0b1e3d', marginBottom: 10 }}>
              📌 Select Tasks to Handover
              <span style={{ fontSize: 11, color: '#6b7a90', fontFamily: "'Nunito',sans-serif", fontWeight: 600, marginLeft: 8 }}>({selectedIds.size} selected)</span>
            </div>
            {!form.fromName ? (
              <div style={{ padding: 14, background: '#f8fbff', border: '1px solid #d8e2ef', borderRadius: 9, color: '#6b7a90', fontSize: 13 }}>Please select a 'Handover From' employee first</div>
            ) : eligibleTasks.length === 0 ? (
              <div style={{ padding: 14, background: '#f8fbff', border: '1px solid #d8e2ef', borderRadius: 9, textAlign: 'center', color: '#6b7a90', fontSize: 13 }}>This employee has no pending tasks</div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '8px 12px', background: '#f8fbff', borderRadius: 8, border: '1px solid #d8e2ef' }}>
                  <input type="checkbox" checked={selectedIds.size === eligibleTasks.length && eligibleTasks.length > 0} onChange={toggleAll} style={{ width: 15, height: 15, cursor: 'pointer' }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#1a2535' }}>Select All ({eligibleTasks.length} tasks)</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 300, overflowY: 'auto' }}>
                  {eligibleTasks.map(t => (
                    <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', background: selectedIds.has(t.id) ? '#f0fdf4' : '#f8fbff', border: `1px solid ${selectedIds.has(t.id) ? '#86efac' : '#d8e2ef'}`, borderRadius: 9, cursor: 'pointer' }}>
                      <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleTask(t.id)} style={{ width: 15, height: 15, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{t.name}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
                          <DeptTag name={t.dept} />
                          <PriorityBadge priority={t.priority} />
                          {t.schedDate && <span style={{ fontSize: 10.5, color: '#0d7377' }}>📅 {fDate(t.schedDate)}</span>}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #d8e2ef', display: 'flex', gap: 8 }}>
            <button onClick={handleSubmit} disabled={saving} style={{ padding: '9px 22px', borderRadius: 8, background: saving ? '#6b7a90' : '#0d7377', color: 'white', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13 }}>
              {saving ? '⏳ Saving...' : editingId ? `✏️ Update Handover` : `🔄 Create Handover (${selectedIds.size} tasks)`}
            </button>
            <button onClick={resetForm} style={{ padding: '9px 16px', borderRadius: 8, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={{ ...IS, width: 'auto' }}>
          <option value="">ALL DEPTS</option>
          {depts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...IS, width: 'auto' }}>
          <option value="">ALL STATUS</option>
          <option value="pending_accept">⏳ Pending Accept</option>
          <option value="accepted">✅ Accepted</option>
          <option value="rejected">❌ Rejected</option>
          <option value="active">🟢 Active (date range)</option>
          <option value="upcoming">🔵 Upcoming</option>
          <option value="completed">✅ Date Completed</option>
        </select>
      </div>

      {/* Handover cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {paged.items.length ? paged.items.map(h => {
          const st = handoverStatus(h);
          const sc = STATUS_CFG[st] || STATUS_CFG.old;
          const decSc = STATUS_CFG[h.status];
          const isExpanded = expandedId === h.id;
          const taskIds = h.taskIds || [];
          const taskObjs = taskIds.map(id => tasks.find(t => t.id === id)).filter(Boolean);
          const doneCount = taskObjs.filter(t => t.status === 'done').length;
          const isActive = st === 'active' && h.status === 'accepted';
          const isPending = h.status === 'pending';

          return (
            <div key={h.id} style={{ background: 'white', borderRadius: 12, border: `1px solid ${isActive ? '#86efac' : isPending ? '#f5c842' : '#d8e2ef'}`, padding: '14px 16px', borderLeft: `4px solid ${isActive ? '#1a7a4a' : isPending ? '#f5c842' : st === 'upcoming' ? '#1a56db' : '#6b7a90'}` }}>
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 800, fontSize: 14 }}>{h.fromName}</span>
                  <span style={{ color: '#6b7a90', fontSize: 13 }}> → </span>
                  <span style={{ fontWeight: 800, fontSize: 14 }}>{h.toName}</span>
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  <span style={{ background: sc.bg, color: sc.color, padding: '3px 10px', borderRadius: 20, fontSize: 10.5, fontWeight: 800, border: `1px solid ${sc.border}` }}>{sc.label}</span>
                  {decSc && h.status !== 'active' && <span style={{ background: decSc.bg, color: decSc.color, padding: '3px 10px', borderRadius: 20, fontSize: 10.5, fontWeight: 800, border: `1px solid ${decSc.border || '#d8e2ef'}` }}>{decSc.label}</span>}
                </div>
              </div>

              {/* Meta */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: '#6b7a90', marginBottom: 8, alignItems: 'center' }}>
                {h.dept && <DeptTag name={h.dept} />}
                {h.dateStart ? <span>📅 {fDate(h.dateStart)} → {fDate(h.dateEnd)}</span> : h.date ? <span>📅 {fDate(h.date)}</span> : null}
                {taskIds.length > 0 && <span style={{ fontWeight: 700, color: '#0d7377' }}>📌 {taskIds.length} tasks ({doneCount}/{taskIds.length} done)</span>}
              </div>

              {/* Notes */}
              {h.notes && <div style={{ fontSize: 12, background: '#f8fbff', padding: '7px 10px', borderRadius: 7, marginBottom: 8 }}>📝 {h.notes}</div>}

              {/* Decision remark */}
              {h.decisionRemark && (
                <div style={{ fontSize: 12, background: h.status === 'rejected' ? '#fde8e8' : '#f8fbff', padding: '7px 10px', borderRadius: 7, marginBottom: 8, color: h.status === 'rejected' ? '#c0392b' : '#4a5568' }}>
                  💬 Remark: {h.decisionRemark} {h.decisionBy ? `(by ${h.decisionBy})` : ''}
                </div>
              )}

              {/* Progress bar */}
              {taskIds.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ height: 5, background: '#e4eaf2', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(doneCount / taskIds.length) * 100}%`, background: doneCount === taskIds.length ? '#1a7a4a' : '#0d7377', borderRadius: 10, transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ fontSize: 10.5, color: '#6b7a90', marginTop: 3 }}>{doneCount}/{taskIds.length} tasks completed</div>
                </div>
              )}

              {/* Expandable task list */}
              {taskIds.length > 0 && (
                <>
                  <button onClick={() => setExpandedId(isExpanded ? null : h.id)} style={{ fontSize: 11.5, color: '#0d7377', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: isExpanded ? 8 : 0 }}>
                    {isExpanded ? '▲ Hide tasks' : `▼ Show tasks (${taskIds.length})`}
                  </button>
                  {isExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6 }}>
                      {taskObjs.map(t => (
                        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: t.status === 'done' ? '#f0fdf4' : '#f8fbff', border: `1px solid ${t.status === 'done' ? '#86efac' : '#d8e2ef'}`, borderRadius: 8 }}>
                          <div>
                            <span style={{ fontWeight: 700, fontSize: 12.5 }}>{t.name}</span>
                            <span style={{ fontSize: 11, color: '#6b7a90', marginLeft: 8 }}>{t.dept}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {t.schedDate && <span style={{ fontSize: 10.5, color: '#6b7a90' }}>📅 {fDate(t.schedDate)}</span>}
                            {t.status === 'done'
                              ? <span style={{ background: '#d4edda', color: '#155724', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 800 }}>✅ Done {t.doneBy ? `by ${t.doneBy}` : ''}</span>
                              : <span style={{ background: '#fff3cd', color: '#7a4800', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 800 }}>⏳ Pending</span>}
                          </div>
                        </div>
                      ))}
                      {taskIds.filter(id => !tasks.find(t => t.id === id)).map(id => (
                        <div key={id} style={{ padding: '6px 10px', background: '#f3f7fc', border: '1px solid #e4eaf2', borderRadius: 8, fontSize: 11, color: '#6b7a90' }}>
                          📎 Task ID: {id.slice(-6)} (not found / deleted)
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Admin actions: edit + cancel + delete */}
              {canEditDelete && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button onClick={() => openEditForm(h)} style={{ padding: '4px 11px', borderRadius: 7, background: 'transparent', border: '1px solid #0d7377', color: '#0d7377', cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>✏️ Edit</button>
                  {(st === 'active' || st === 'upcoming' || h.status === 'pending') && (
                    <button onClick={() => cancelHandover(h)} style={{ padding: '4px 10px', borderRadius: 7, background: 'transparent', border: '1px solid #c0392b', color: '#c0392b', cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>✕ Cancel</button>
                  )}
                  <button onClick={async () => {
                    if (!window.confirm('Delete?')) return;
                    const result = await moveToTrash('handover', h.id);
                    if (result && result.error) {
                      alert('Could not delete from database. Please check your connection and try again.');
                    }
                  }} style={{ padding: '4px 9px', borderRadius: 7, background: 'transparent', border: '1px solid #d8e2ef', cursor: 'pointer', fontSize: 12, color: '#c0392b' }}>🗑️</button>
                </div>
              )}
            </div>
          );
        }) : <EmptyState icon="🔄" message="NO HANDOVERS FOUND" />}
        <Pagination {...paged} onPage={(p) => setPage(p)} />
      </div>
    </div>
  );
}
