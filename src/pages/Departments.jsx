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
  const { hasPerm, currentRole } = useAuth();
  const { depts, employees, tasks, issues, save, logAct, moveToTrash } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editDept, setEditDept] = useState(null);
  const [form, setForm] = useState({ name: '', hod: '', phone: '', email: '', floor: '' });

  const canEdit = currentRole === 'mainadmin' || hasPerm('departments_edit');

  function openNew() { setForm({ name: '', hod: '', phone: '', email: '', floor: '' }); setEditDept(null); setShowForm(true); }
  function openEdit(d) { setForm({ name: d.name, hod: d.hod || '', phone: d.phone || '', email: d.email || '', floor: d.floor || '' }); setEditDept(d); setShowForm(true); }

  async function handleSave() {
    if (!form.name.trim()) { alert('Department name is required!'); return; }
    const obj = { id: editDept?.id || uid(), name: form.name.toUpperCase().trim(), hod: form.hod ? form.hod.toUpperCase() : '', phone: form.phone, email: form.email, floor: form.floor };
    const newDepts = editDept ? depts.map((d) => d.id === obj.id ? obj : d) : [...depts, obj];
    await save('hops-depts', newDepts);

    // Sync dept name change → update employees whose dept matched the old name
    const prevName = (editDept?.name || '').toUpperCase();
    const newName = obj.name.toUpperCase();
    const prevHod = (editDept?.hod || '').toUpperCase();
    const newHod = obj.hod.toUpperCase();

    const nameChanged = editDept && prevName && prevName !== newName;
    const hodChanged = prevHod !== newHod;

    if (nameChanged || hodChanged) {
      const updatedEmps = employees.map(e => {
        const n = e.name.toUpperCase();
        let updated = { ...e };
        if (nameChanged && e.dept === editDept.name) updated.dept = obj.name; // update dept name
        if (hodChanged) {
          if (newHod && n === newHod) updated.isIncharge = true;
          if (prevHod && n === prevHod) updated.isIncharge = false;
        }
        return updated;
      });
      await save('hops-employees', updatedEmps);
    }

    await logAct(editDept ? 'DEPT UPDATED' : 'DEPT ADDED', obj.name);
    setShowForm(false);
  }

  // Employees available as incharge: not already incharge of another department
  const assignedIncharges = depts
    .filter(d => d.id !== editDept?.id)
    .map(d => (d.hod || '').toUpperCase())
    .filter(Boolean);
  const inchargeOptions = employees.filter(e => !assignedIncharges.includes(e.name.toUpperCase()));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>Departments ({depts.length})</h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
                  <button onClick={async () => { if (confirm('Delete dept?')) await moveToTrash('dept', d.id); }} style={{ padding: '7px 12px', borderRadius: 8, background: 'transparent', border: '1px solid #e0e8f0', cursor: 'pointer', fontSize: 13, color: '#94a3b8' }}>🗑️</button>
                </div>
              )}
            </div>
          );
        }) : <div style={{ gridColumn: '1/-1' }}><EmptyState icon="🏢" message="NO DEPARTMENTS FOUND" /></div>}
      </div>

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
