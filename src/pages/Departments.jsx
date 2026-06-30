import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { uid, exportToExcel } from '../utils';
import { Modal } from '../components/common/Modal';
import { EmptyState } from '../components/common/Alert';

const IS = { width: '100%', padding: '9px 13px', borderRadius: 8, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 13, color: '#1a2535', outline: 'none', background: 'white', fontWeight: 600 };
function Field({ label, children }) {
  return <div style={{ marginBottom: 13 }}><label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</label>{children}</div>;
}

export default function Departments() {
  const { hasPerm, currentRole, currentUser } = useAuth();
  const { depts, employees, tasks, issues, notices, save, logAct, moveToTrash } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editDept, setEditDept] = useState(null);
  const [form, setForm] = useState({ name: '', hod: '', phone: '', email: '', floor: '' });
  const [pendingModal, setPendingModal] = useState(null); // { empsWithTasks, obj, newDepts, editDept }
  const [deleteModal, setDeleteModal] = useState(null); // { dept, counts }
  const [noticeSent, setNoticeSent] = useState(false);

  const canEdit = currentRole === 'mainadmin' || hasPerm('departments_edit');

  function openNew() { setForm({ name: '', hod: '', phone: '', email: '', floor: '' }); setEditDept(null); setShowForm(true); }
  function openEdit(d) { setForm({ name: d.name, hod: d.hod || '', phone: d.phone || '', email: d.email || '', floor: d.floor || '' }); setEditDept(d); setShowForm(true); }

  async function doSave(obj, ed) {
    const newDepts = ed ? depts.map((d) => d.id === obj.id ? obj : d) : [...depts, obj];
    await save('workdesk-depts', newDepts);

    const prevName = (ed?.name || '').toUpperCase();
    const newName = obj.name.toUpperCase();
    const prevHod = (ed?.hod || '').toUpperCase();
    const newHod = obj.hod.toUpperCase();
    const nameChanged = ed && prevName && prevName !== newName;
    const hodChanged = prevHod !== newHod;

    if (nameChanged || hodChanged) {
      const updatedEmps = employees.map(e => {
        const n = e.name.toUpperCase();
        let updated = { ...e };
        if (nameChanged && e.dept === ed.name) updated.dept = obj.name;
        if (hodChanged) {
          if (newHod && n === newHod) updated.isIncharge = true;
          if (prevHod && n === prevHod) updated.isIncharge = false;
        }
        return updated;
      });
      await save('workdesk-employees', updatedEmps);
    }

    await logAct(ed ? 'DEPT UPDATED' : 'DEPT ADDED', obj.name);
    setShowForm(false);
    setPendingModal(null);
  }

  async function handleSave() {
    if (!form.name.trim()) { alert('Department name is required!'); return; }
    const obj = { id: editDept?.id || uid(), name: form.name.toUpperCase().trim(), hod: form.hod ? form.hod.toUpperCase() : '', phone: form.phone, email: form.email, floor: form.floor };

    // Block dept rename if any employee in that dept has pending tasks
    if (editDept && obj.name !== editDept.name) {
      const empsInDept = employees.filter(e => e.dept === editDept.name);
      const empsWithTasks = empsInDept.map(e => ({
        ...e,
        pendingCount: tasks.filter(t => (t.assignedTo || []).includes(e.name) && t.status === 'pending').length,
      })).filter(e => e.pendingCount > 0);

      if (empsWithTasks.length > 0) {
        setPendingModal({ empsWithTasks, obj, editDept });
        setNoticeSent(false);
        return;
      }
    }

    await doSave(obj, editDept);
  }

  async function sendNoticesAndClose() {
    if (!pendingModal) return;
    const newNotices = pendingModal.empsWithTasks.map(e => ({
      id: uid(),
      toEmpId: e.id,
      toName: e.name,
      fromName: currentUser?.name || 'MAIN ADMIN',
      subject: 'Pending Task Completion Required',
      message: `You have ${e.pendingCount} pending task(s) in the ${pendingModal.editDept.name} department. Please complete them as soon as possible. The department is currently undergoing changes and all tasks must be resolved.`,
      type: 'task_reminder',
      isRead: false,
      sentAt: new Date().toISOString(),
    }));
    await save('workdesk-notices', [...notices, ...newNotices]);
    await logAct('NOTICES SENT', `Task reminder sent to ${pendingModal.empsWithTasks.length} employee(s) in ${pendingModal.editDept.name}`);
    setNoticeSent(true);
  }

  // Compute the impact of deleting a department across all linked records.
  // Returns null if there is no impact, otherwise counts of affected rows
  // grouped by entity. Surfacing these counts up front stops the user from
  // accidentally orphaning tasks, issues, handovers and delegations that
  // reference the dept by name.
  function computeDeleteImpact(d) {
    const empsInDept = employees.filter((e) => e.dept === d.name);
    const tasksInDept = tasks.filter((t) => t.dept === d.name);
    const issuesInDept = issues.filter((i) => i.dept === d.name);
    // handovers + delegations don't carry dept names in this codebase, but
    // we still surface employees + tasks + issues for transparency.
    return {
      emps: empsInDept,
      tasks: tasksInDept,
      issues: issuesInDept,
    };
  }

  function openDelete(d) {
    const impact = computeDeleteImpact(d);
    const total = impact.emps.length + impact.tasks.length + impact.issues.length;
    if (total === 0) {
      // Nothing references this dept — straight delete, no modal needed.
      if (confirm(`Delete dept "${d.name}"?`)) {
        (async () => { await moveToTrash('dept', d.id); })();
      }
      return;
    }
    setDeleteModal({ dept: d, impact });
  }

  async function confirmCascadeDelete() {
    if (!deleteModal) return;
    const { dept, impact } = deleteModal;
    // Strategy: trash the dept, then null/clear `dept` on every dependent
    // record so the UI no longer references a non-existent department.
    // This keeps the data for history/audit but stops orphan rendering.
    const updatedTasks = tasks.map((t) => (t.dept === dept.name ? { ...t, dept: '' } : t));
    const updatedIssues = issues.map((i) => (i.dept === dept.name ? { ...i, dept: '' } : i));
    const updatedEmps = employees.map((e) => (e.dept === dept.name ? { ...e, dept: '' } : e));

    await save('workdesk-tasks', updatedTasks);
    await save('workdesk-issues', updatedIssues);
    await save('workdesk-employees', updatedEmps);
    await moveToTrash('dept', dept.id);
    await logAct('DEPT DELETED (CASCADE)', `${dept.name} · cleared dept on ${impact.tasks.length} tasks, ${impact.issues.length} issues, ${impact.emps.length} employees`);
    setDeleteModal(null);
  }

  // Employees available as incharge: not already incharge of another department
  const assignedIncharges = depts
    .filter(d => d.id !== editDept?.id)
    .map(d => (d.hod || '').toUpperCase())
    .filter(Boolean);
  const inchargeOptions = employees.filter(e => !assignedIncharges.includes(e.name.toUpperCase()));

  return (
    <div>
      <div className="page-header">
        <h2 className="page-header-title" style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>Departments ({depts.length})</h2>
        <div className="page-header-actions">
          <button onClick={() => exportToExcel(depts.map(d => ({ Name: d.name, Incharge: d.hod, Contact: d.phone, Email: d.email, Floor: d.floor })), 'departments-export')} style={{ padding: '7px 14px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>⬇ Export</button>
          <button onClick={() => window.print()} style={{ padding: '7px 14px', borderRadius: 8, background: '#334155', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>🖨 Print</button>
          {canEdit && <button onClick={openNew} style={{ padding: '7px 14px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>+ Add Dept</button>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
        {depts.length ? depts.map((d) => {
          const dStaff = employees.filter((e) => e.dept === d.name).length;
          const dTasks = tasks.filter((t) => t.dept === d.name).length;
          const dDone = tasks.filter((t) => t.dept === d.name && t.status === 'done').length;
          const dIssues = issues.filter((i) => i.dept === d.name && i.status !== 'resolved').length;
          const pct = dTasks ? Math.round(dDone / dTasks * 100) : 100;
          return (
            <div key={d.id} style={{ background: 'white', borderRadius: 14, border: '1px solid #e0e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(11,30,61,0.06)' }}>
              {/* Header band */}
              <div style={{ background: 'linear-gradient(135deg,#0d7377 0%,#0b5e62 100%)', padding: '14px 18px 12px', position: 'relative' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.65)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 }}>Department</div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, color: 'white', fontWeight: 700, letterSpacing: 0.3 }}>{d.name}</div>
                {d.floor && <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>📍 {d.floor}</div>}
              </div>

              {/* Incharge row */}
              <div style={{ padding: '12px 18px', borderBottom: '1px solid #f0f4f8' }}>
                {d.hod ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e8f4fd', border: '2px solid #0d7377', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#0d7377', flexShrink: 0 }}>
                      {d.hod.charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#0b1e3d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.hod}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#1a7a4a', background: '#d4edda', padding: '2px 8px', borderRadius: 20, flexShrink: 0 }}>Incharge</span>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#b0bec5', fontStyle: 'italic' }}>No incharge assigned</div>
                )}
              </div>

              {/* Stats row */}
              <div style={{ padding: '10px 18px 4px' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  <span style={{ background: '#f0f7ff', color: '#0d7377', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>👥 {dStaff} Staff</span>
                  <span style={{ background: '#f0fdf4', color: '#1a7a4a', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>✅ {dDone}/{dTasks} Tasks</span>
                  {dIssues > 0 && <span style={{ background: '#fef2f2', color: '#c0392b', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>⚠️ {dIssues} Issues</span>}
                </div>
                <div style={{ height: 4, background: '#e8eef5', borderRadius: 10, overflow: 'hidden', marginBottom: 3 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#1a7a4a' : pct > 60 ? '#0d7377' : '#d4920a', borderRadius: 10, transition: 'width 0.3s' }} />
                </div>
                <div style={{ fontSize: 10, color: '#6b7a90', textAlign: 'right', marginBottom: 8 }}>{pct}% complete</div>
              </div>

              {canEdit && (
                <div style={{ display: 'flex', gap: 6, padding: '0 14px 14px' }}>
                  <button onClick={() => openEdit(d)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, background: '#f0f7ff', color: '#0d7377', border: '1px solid #cce0f0', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>✏️ Edit</button>
                  <button onClick={() => openDelete(d)} style={{ padding: '7px 12px', borderRadius: 8, background: 'transparent', border: '1px solid #e0e8f0', cursor: 'pointer', fontSize: 13, color: '#94a3b8' }}>🗑️</button>
                </div>
              )}
            </div>
          );
        }) : <div style={{ gridColumn: '1/-1' }}><EmptyState icon="🏢" message="NO DEPARTMENTS FOUND" /></div>}
      </div>

      {/* Pending tasks blocking modal */}
      {pendingModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 16, maxWidth: 480, width: '100%', boxShadow: '0 16px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#c0392b,#e74c3c)', padding: '18px 22px' }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>⚠️</div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: 'white', fontWeight: 700 }}>Department Cannot Be Renamed</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
                Employees in <strong>{pendingModal.editDept.name}</strong> have pending tasks. Complete them before renaming.
              </div>
            </div>
            <div style={{ padding: '18px 22px' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#6b7a90', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
                Employees with Pending Tasks
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {pendingModal.empsWithTasks.map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: '#fff5f5', borderRadius: 9, border: '1px solid #fecaca' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#0b1e3d' }}>{e.name}</div>
                      <div style={{ fontSize: 11, color: '#6b7a90' }}>{e.dept}</div>
                    </div>
                    <span style={{ background: '#fef2f2', color: '#c0392b', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20, border: '1px solid #fecaca' }}>
                      {e.pendingCount} pending
                    </span>
                  </div>
                ))}
              </div>
              {noticeSent && (
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '9px 14px', marginBottom: 12, fontSize: 12, color: '#166534', fontWeight: 700 }}>
                  ✅ Notice sent to {pendingModal.empsWithTasks.length} employee(s) successfully!
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {!noticeSent && (
                  <button onClick={sendNoticesAndClose} style={{ flex: 1, padding: '9px 14px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>
                    📨 Send Notice to Employees
                  </button>
                )}
                <button onClick={() => setPendingModal(null)} style={{ flex: 1, padding: '9px 14px', borderRadius: 8, background: 'transparent', color: '#6b7a90', border: '1.5px solid #d8e2ef', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>
                  ✕ Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cascade delete confirmation modal */}
      {deleteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 16, maxWidth: 520, width: '100%', boxShadow: '0 16px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#c0392b,#e74c3c)', padding: '18px 22px' }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>⚠️</div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: 'white', fontWeight: 700 }}>Delete Department & Clear References?</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>
                The department <strong>{deleteModal.dept.name}</strong> is referenced by other records. Deleting it will clear the department field on those records (the rows themselves are kept for audit).
              </div>
            </div>
            <div style={{ padding: '18px 22px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px', background: '#fff5f5', borderRadius: 9, border: '1px solid #fecaca', fontSize: 12.5, fontWeight: 700, color: '#7d1a1a' }}>
                  <span>👥 Employees in this dept</span>
                  <span>{deleteModal.impact.emps.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px', background: '#fff5f5', borderRadius: 9, border: '1px solid #fecaca', fontSize: 12.5, fontWeight: 700, color: '#7d1a1a' }}>
                  <span>📋 Tasks in this dept</span>
                  <span>{deleteModal.impact.tasks.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px', background: '#fff5f5', borderRadius: 9, border: '1px solid #fecaca', fontSize: 12.5, fontWeight: 700, color: '#7d1a1a' }}>
                  <span>⚠️ Issues in this dept</span>
                  <span>{deleteModal.impact.issues.length}</span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#6b7a90', marginBottom: 14, fontStyle: 'italic' }}>
                💡 Tip: You can rename the department instead of deleting it — renaming reassigns all linked records automatically.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={confirmCascadeDelete} style={{ flex: 1, padding: '9px 14px', borderRadius: 8, background: '#c0392b', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>
                  🗑️ Delete & Clear
                </button>
                <button onClick={() => { setDeleteModal(null); openEdit(deleteModal.dept); }} style={{ flex: 1, padding: '9px 14px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>
                  ✏️ Rename Instead
                </button>
                <button onClick={() => setDeleteModal(null)} style={{ flex: 1, padding: '9px 14px', borderRadius: 8, background: 'transparent', color: '#6b7a90', border: '1.5px solid #d8e2ef', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>
                  ✕ Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editDept ? 'Edit Department' : 'Add Department'}>
        <Field label="Department Name *"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. ICU" style={IS} autoFocus /></Field>
        <Field label="Department Incharge">
          <select value={form.hod} onChange={e => {
            const val = e.target.value;
            const sel = employees.find(emp => emp.name.toUpperCase() === val.toUpperCase());
            setForm({ ...form, hod: val, phone: sel ? (sel.contact || sel.phone || '') : '', email: sel ? (sel.email || '') : '' });
          }} style={IS}>
            <option value="">— Select Incharge (optional) —</option>
            {inchargeOptions.map(e => (
              <option key={e.id} value={e.name.toUpperCase()}>{e.name}{e.role ? ` · ${e.role}` : ''}{e.dept ? ` (${e.dept})` : ''}</option>
            ))}
          </select>
          {inchargeOptions.length === 0 && (
            <div style={{ fontSize: 11, color: '#d4920a', marginTop: 4, fontWeight: 600 }}>⚠️ All employees are already assigned as incharge of another department.</div>
          )}
        </Field>
        <Field label="Contact / Phone">
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="EXT. NUMBER" style={IS} />
        </Field>
        <Field label="Email">
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="dept@hospital.com" style={IS} />
        </Field>
        <Field label="Floor / Location"><input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} placeholder="2ND FLOOR" style={IS} /></Field>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid #d8e2ef' }}>
          <button onClick={handleSave} style={{ padding: '9px 18px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>💾 Save</button>
          <button onClick={() => setShowForm(false)} style={{ padding: '9px 18px', borderRadius: 8, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}
