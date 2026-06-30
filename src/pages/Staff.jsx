import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { uid, exportToExcel, toDay, deriveUsernameFromEmail, isValidEmail, makeUniqueUsername } from '../utils';
import { sendWelcomeEmail } from '../lib/emailService';
import { ALL_PERMS } from '../constants';
import { Modal } from '../components/common/Modal';
import { EmptyState } from '../components/common/Alert';
import { Pagination, paginate } from '../components/common/Pagination';
import { FilterPopup, FilterField, FP_INPUT } from '../components/common/FilterPopup';

const IS = { width: '100%', padding: '9px 13px', borderRadius: 8, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 13, color: '#1a2535', outline: 'none', background: 'white', fontWeight: 600 };
function Field({ label, children }) {
  return <div style={{ marginBottom: 13 }}><label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</label>{children}</div>;
}

function EmpPwField({ value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder="SET PASSWORD" style={{ ...IS, paddingRight: 40 }} />
      <button type="button" onClick={() => setShow((s) => !s)} tabIndex={-1} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: '#6b7a90', lineHeight: 1 }}>
        {show ? '🙈' : '👁️'}
      </button>
    </div>
  );
}

export default function Staff() {
  const { hasPerm, currentRole, currentUser } = useAuth();
  const { employees, depts, tasks, notices, save, logAct, moveToTrash } = useApp();
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editEmp, setEditEmp] = useState(null);
  const [form, setForm] = useState({ name: '', dept: '', role: '', contact: '', email: '', password: '' });
  const [emailError, setEmailError] = useState('');
  const [perms, setPerms] = useState([]);
  const [page, setPage] = useState(1);
  const [pendingTaskModal, setPendingTaskModal] = useState(null); // { emp, pendingCount, newDept, noticeMsg }

  const canEdit = currentRole === 'mainadmin' || hasPerm('employees_edit');

  const filtered = employees.filter((e) => {
    if (search && !e.name.toUpperCase().includes(search.toUpperCase())) return false;
    if (filterDept && e.dept !== filterDept) return false;
    return true;
  });
  const paged = paginate(filtered, page);

  function openNew() { setForm({ name: '', dept: '', role: '', isIncharge: false, contact: '', email: '', password: '' }); setPerms([]); setEditEmp(null); setShowForm(true); setEmailError(''); }
  function openEdit(e) { setForm({ name: e.name, dept: e.dept, role: e.role || '', isIncharge: e.isIncharge || false, contact: e.contact || '', email: e.email || '', password: e.password || '' }); setPerms(e.perms || []); setEditEmp(e); setShowForm(true); }

  async function handleSave() {
    if (!form.name.trim() || !form.dept) { alert('Name and Department are required!'); return; }
    if (!editEmp && !form.password.trim()) { alert('Password is required for new staff!'); return; }
    if (!isValidEmail(form.email)) { alert('A valid Gmail address is required (e.g. user@gmail.com)!'); return; }
    const baseUsername = deriveUsernameFromEmail(form.email);
    const username = editEmp
      ? (editEmp.username || baseUsername)
      : makeUniqueUsername(baseUsername, employees);
    const obj = { id: editEmp?.id || uid(), name: form.name.toUpperCase().trim(), dept: form.dept, role: form.isIncharge ? 'INCHARGE' : 'STAFF', isIncharge: form.isIncharge, contact: form.contact, email: form.email.trim().toLowerCase(), password: form.password || editEmp?.password || '', username, perms };
    const isNew = !editEmp;
    const deptChanged = editEmp && editEmp.dept !== obj.dept;
    const todayStr = toDay();
    const isCurrentDatePending = (t) => t.status === 'pending' && (!t.schedDate || t.schedDate <= todayStr);
    // Upcoming tasks (schedDate > today) do NOT block a dept change — only
    // tasks that are actually due need to be wrapped up first.
    const empPendingCount = deptChanged ? tasks.filter(t => (t.assignedTo || []).includes(obj.name) && isCurrentDatePending(t)).length : 0;

    // Keep old dept until employee accepts; record new target dept in pendingDept
    const objToSave = deptChanged
      ? { ...obj, dept: editEmp.dept, pendingDept: obj.dept }
      : obj;
    const newEmps = editEmp ? employees.map((e) => e.id === obj.id ? objToSave : e) : [...employees, obj];
    await save('workdesk-employees', newEmps);

    // Audit trail: when editing an existing employee, log every field that
    // changed so the activity log captures role/dept/permission transitions.
    // Without this the activity log only shows "EMPLOYEE UPDATED" with no
    // detail about what actually changed, which makes auditing impossible.
    if (editEmp) {
      const fields = [];
      if ((editEmp.name || '') !== obj.name) fields.push(`name: "${editEmp.name}" → "${obj.name}"`);
      if ((editEmp.dept || '') !== obj.dept) fields.push(`dept: "${editEmp.dept || '—'}" → "${obj.dept || '—'}"`);
      if ((editEmp.role || '') !== obj.role) fields.push(`role: "${editEmp.role || '—'}" → "${obj.role}"`);
      if (!!editEmp.isIncharge !== !!obj.isIncharge) fields.push(`incharge: ${editEmp.isIncharge ? 'yes' : 'no'} → ${obj.isIncharge ? 'yes' : 'no'}`);
      const oldPerms = (editEmp.perms || []).slice().sort().join(',');
      const newPerms = obj.perms.slice().sort().join(',');
      if (oldPerms !== newPerms) {
        fields.push(`perms: [${oldPerms || '∅'}] → [${newPerms || '∅'}]`);
      }
      if (fields.length > 0) {
        await logAct('EMPLOYEE FIELDS CHANGED', `${obj.name} · ${fields.join('; ')}`);
      }
    }

    if (deptChanged) {
      if (empPendingCount === 0) {
        // No pending tasks → auto-send dept_change_approval notice right now
        const notice = {
          id: uid(), toEmpId: obj.id, toName: obj.name,
          fromName: 'MAIN ADMIN',
          subject: 'DEPARTMENT CHANGE REQUEST',
          message: `Dear ${obj.name},\n\nYour department is being changed from "${editEmp.dept}" to "${obj.dept}".\n\nPlease accept this change at your earliest convenience.\n\nRegards,\nMAIN ADMIN`,
          type: 'dept_change_approval', isRead: false, sentAt: new Date().toISOString(),
          meta: { newDept: obj.dept, oldDept: editEmp.dept, empId: obj.id },
        };
        await save('workdesk-notices', [...(notices || []), notice]);
      }
    }

    // Sync isIncharge → department's hod field
    if (form.isIncharge) {
      const updatedDepts = depts.map(d => {
        if (d.name === obj.dept) return { ...d, hod: obj.name };
        if ((d.hod || '').toUpperCase() === obj.name) return { ...d, hod: '' };
        return d;
      });
      await save('workdesk-depts', updatedDepts);
    } else {
      const hadDept = depts.find(d => (d.hod || '').toUpperCase() === obj.name);
      if (hadDept) {
        await save('workdesk-depts', depts.map(d => (d.hod || '').toUpperCase() === obj.name ? { ...d, hod: '' } : d));
      }
    }

    await logAct(editEmp ? 'EMPLOYEE UPDATED' : 'EMPLOYEE ADDED', obj.name);
    if (isNew && obj.email) sendWelcomeEmail(obj);
    setShowForm(false);

    // If pending tasks exist → show popup so admin can send a task-reminder notice manually
    if (deptChanged && empPendingCount > 0) {
      setPendingTaskModal({
        emp: obj,
        pendingCount: empPendingCount,
        newDept: obj.dept,
        noticeMsg: `Dear ${obj.name},\n\nYour department is being changed to "${obj.dept}". However, you have ${empPendingCount} pending task(s) that need to be completed first.\n\nPlease complete your pending tasks as soon as possible.\n\nRegards,\nMAIN ADMIN`,
      });
    }
  }

  async function sendPendingNotice() {
    if (!pendingTaskModal) return;
    const notice = {
      id: uid(), toEmpId: pendingTaskModal.emp.id, toName: pendingTaskModal.emp.name,
      fromName: 'MAIN ADMIN',
      subject: 'COMPLETE YOUR PENDING TASKS',
      message: pendingTaskModal.noticeMsg,
      type: 'task_reminder', isRead: false, sentAt: new Date().toISOString(), meta: null,
    };
    await save('workdesk-notices', [...(notices || []), notice]);
    await logAct('NOTICE SENT', `Pending task reminder to ${pendingTaskModal.emp.name}`);
    setPendingTaskModal(null);
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-header-title" style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>Employee List</h2>
        <div className="page-header-actions">
          <button onClick={() => exportToExcel(filtered.map(e => ({ Name: e.name, Department: e.dept, Role: e.role, Contact: e.contact, Email: e.email })), 'employees-export')} style={{ padding: '7px 14px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>⬇ Export</button>
          <button onClick={() => window.print()} style={{ padding: '7px 14px', borderRadius: 8, background: '#334155', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>🖨 Print</button>
          {canEdit && <button onClick={openNew} style={{ padding: '7px 14px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>+ Add Employee</button>}
        </div>
      </div>

      {/* Filter popup — search + department, scoped to employee fields.
          Matches the shared FilterPopup design used on Manage Tasks. */}
      <FilterPopup
        activeCount={(search ? 1 : 0) + (filterDept ? 1 : 0)}
        onClear={() => { setSearch(''); setFilterDept(''); }}
      >
        <FilterField label="Search">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="SEARCH EMPLOYEE NAME..." style={FP_INPUT} autoFocus />
        </FilterField>
        <FilterField label="Department">
          <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} style={FP_INPUT}>
            <option value="">ALL DEPTS</option>
            {depts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
        </FilterField>
      </FilterPopup>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 14 }}>
        {paged.items.length ? paged.items.map((e) => (
          <div key={e.id} style={{ background: 'white', borderRadius: 14, border: '1px solid #e0e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(11,30,61,0.06)' }}>
            {/* Header */}
            <div style={{ background: e.isIncharge ? 'linear-gradient(135deg,#1a7a4a 0%,#155d38 100%)' : 'linear-gradient(135deg,#0d7377 0%,#0b5e62 100%)', padding: '16px 16px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 17, color: 'white', flexShrink: 0 }}>
                {e.name.charAt(0)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 2, fontWeight: 700, letterSpacing: 0.5 }}>
                  {e.isIncharge ? '★ DEPT. INCHARGE' : 'STAFF'}
                </div>
              </div>
            </div>
            {/* Body */}
            <div style={{ padding: '12px 14px 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, marginBottom: 5, color: e.dept ? '#334155' : '#b0bec5' }}>
                <span style={{ color: e.dept ? '#0d7377' : '#b0bec5' }}>🏢</span>
                {e.dept || <span style={{ fontStyle: 'italic', fontWeight: 500, fontSize: 11, color: '#e07b00' }}>⚠ Missing dept</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 4, color: e.contact ? '#6b7a90' : '#b0bec5' }}>
                <span>📞</span>
                {e.contact || <span style={{ fontStyle: 'italic', fontSize: 11, color: '#e07b00' }}>⚠ No contact</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: e.email ? '#6b7a90' : '#b0bec5' }}>
                <span>✉️</span>
                {e.email || <span style={{ fontStyle: 'italic', fontSize: 11, color: '#e07b00' }}>⚠ No email</span>}
              </div>
            </div>
            {canEdit && (
              <div style={{ display: 'flex', gap: 6, padding: '10px 12px 12px' }}>
                <button onClick={() => openEdit(e)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, background: '#f0f7ff', color: '#0d7377', border: '1px solid #cce0f0', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>✏️ Edit</button>
                <button onClick={async () => { if (confirm('Remove employee?')) { await moveToTrash('employee', e.id); } }} style={{ padding: '7px 12px', borderRadius: 8, background: 'transparent', border: '1px solid #e0e8f0', cursor: 'pointer', fontSize: 13, color: '#94a3b8' }}>🗑️</button>
              </div>
            )}
          </div>
        )) : <div style={{ gridColumn: '1/-1' }}><EmptyState icon="👥" message="NO EMPLOYEES FOUND" /></div>}
      </div>
      <Pagination {...paged} onPage={(p) => setPage(p)} />

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editEmp ? 'Edit Employee' : 'Add Employee'}>
        <Field label="Full Name *">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="EMPLOYEE NAME" style={IS} autoFocus />
        </Field>
        <Field label="Department *">
          <select value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value })} style={IS}>
            <option value="">Select...</option>
            {depts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', borderRadius: 8, border: `1.5px solid ${form.isIncharge ? '#1a7a4a' : '#d8e2ef'}`, background: form.isIncharge ? '#f0fdf4' : '#f8fbff', cursor: 'pointer', userSelect: 'none', marginBottom: 10 }}>
          <input type="checkbox" checked={form.isIncharge} onChange={e => setForm({ ...form, isIncharge: e.target.checked })} style={{ width: 15, height: 15, accentColor: '#1a7a4a', cursor: 'pointer', flexShrink: 0 }} />
          <div style={{ fontSize: 12, fontWeight: 800, color: form.isIncharge ? '#1a7a4a' : '#6b7a90' }}>★ Mark as Department Incharge</div>
          <div style={{ marginLeft: 'auto', fontSize: 10, color: '#6b7a90' }}>This employee heads the department</div>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Contact Number">
            <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="PHONE" style={IS} />
          </Field>
          <Field label="Email *">
            <input value={form.email} onChange={(e) => { setForm({ ...form, email: e.target.value }); if (emailError) setEmailError(''); }} onBlur={() => { if (form.email && !isValidEmail(form.email)) setEmailError('Enter a valid gmail address (e.g. user@gmail.com)'); }} placeholder="employee@gmail.com" style={{ ...IS, borderColor: emailError ? '#e53e3e' : IS.borderColor }} />
            {emailError && <div style={{ color: '#e53e3e', fontSize: 11, marginTop: 4, fontWeight: 700 }}>{emailError}</div>}
            {form.email && !emailError && deriveUsernameFromEmail(form.email) && (
              <div style={{ color: '#6b7a90', fontSize: 11, marginTop: 4 }}>
                Login username will be: <b style={{ color: '#0d7377' }}>{deriveUsernameFromEmail(form.email)}</b>
              </div>
            )}
          </Field>
        </div>
        <Field label={editEmp ? 'Password (leave blank = no change)' : 'Password *'}>
          <EmpPwField value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
        </Field>

        {/* Permissions — only mainadmin can set */}
        {currentRole === 'mainadmin' && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                🔐 Admin Permissions
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => setPerms(ALL_PERMS.map((p) => p.id))} style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 5, border: '1.5px solid #0d7377', background: '#e8f8ef', color: '#0d7377', cursor: 'pointer' }}>Select All</button>
                <button type="button" onClick={() => setPerms([])} style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 5, border: '1.5px solid #d8e2ef', background: 'transparent', color: '#6b7a90', cursor: 'pointer' }}>Clear</button>
              </div>
            </div>
            <div style={{ border: '1.5px solid #d8e2ef', borderRadius: 8, padding: '10px 12px', background: '#f8fbff', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', maxHeight: 220, overflowY: 'auto' }}>
              {ALL_PERMS.map((p) => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: '5px 7px', borderRadius: 6, background: perms.includes(p.id) ? '#e8f8ef' : 'transparent', border: `1px solid ${perms.includes(p.id) ? '#86efac' : 'transparent'}`, transition: 'all 0.15s' }}>
                  <input
                    type="checkbox"
                    checked={perms.includes(p.id)}
                    onChange={() => setPerms((prev) => prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id])}
                    style={{ width: 13, height: 13, accentColor: '#0d7377', cursor: 'pointer' }}
                  />
                  {p.label}
                </label>
              ))}
            </div>
            {perms.length > 0 && (
              <div style={{ marginTop: 5, fontSize: 11, color: '#0d7377', fontWeight: 700 }}>
                ✅ {perms.length} permission{perms.length > 1 ? 's' : ''} selected — employee will login as Admin
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid #d8e2ef' }}>
          <button onClick={handleSave} style={{ padding: '9px 18px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>💾 Save</button>
          <button onClick={() => setShowForm(false)} style={{ padding: '9px 18px', borderRadius: 8, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>Cancel</button>
        </div>
      </Modal>

      {/* Pending task popup — admin manually sends task-reminder notice */}
      {pendingTaskModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 16, maxWidth: 480, width: '100%', boxShadow: '0 16px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#c0392b,#e74c3c)', padding: '16px 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 20, marginBottom: 4 }}>⚠️</div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, color: 'white', fontWeight: 700 }}>Pending Tasks — Dept Change Blocked</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 3 }}>
                  <strong>{pendingTaskModal.emp.name}</strong> has <strong>{pendingTaskModal.pendingCount} pending task(s)</strong>. Dept will change to <strong>"{pendingTaskModal.newDept}"</strong> only after all tasks are done.
                </div>
              </div>
              <button onClick={() => setPendingTaskModal(null)} style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'rgba(255,255,255,0.15)', color: 'white', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 10 }}>✕</button>
            </div>
            <div style={{ padding: '18px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Notice Message (Editable)</div>
              <textarea
                value={pendingTaskModal.noticeMsg}
                onChange={e => setPendingTaskModal({ ...pendingTaskModal, noticeMsg: e.target.value })}
                rows={6}
                style={{ width: '100%', padding: '9px 13px', borderRadius: 8, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 12, color: '#1a2535', outline: 'none', background: '#f8fbff', fontWeight: 600, resize: 'vertical', lineHeight: 1.65, boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button onClick={sendPendingNotice} style={{ flex: 1, padding: '9px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
                  📨 Send Notice to Employee
                </button>
                <button onClick={() => setPendingTaskModal(null)} style={{ flex: 1, padding: '9px', borderRadius: 8, background: 'transparent', color: '#6b7a90', border: '1.5px solid #d8e2ef', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
                  ✕ Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
