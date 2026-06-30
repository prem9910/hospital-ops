import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { uid, toDay } from '../utils';
import { Alert } from '../components/common/Alert';

const IS = { width: '100%', padding: '9px 13px', borderRadius: 8, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 13, color: '#1a2535', outline: 'none', background: 'white', fontWeight: 600 };
function Field({ label, children }) {
  return <div style={{ marginBottom: 13 }}><label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</label>{children}</div>;
}

export default function AssignTask() {
  const { currentUser } = useAuth();
  const { tasks, employees, depts, save, logAct } = useApp();
  const [form, setForm] = useState({ name: '', dept: '', priority: 'medium', time: '', assignedTo: [], notes: '' });
  const [msg, setMsg] = useState('');

  async function handleSubmit() {
    if (!form.name.trim()) { setMsg('❌ Task name required!'); return; }
    if (!form.dept) { setMsg('❌ Department required!'); return; }
    const obj = { id: uid(), name: form.name.toUpperCase(), dept: form.dept, priority: form.priority, freq: 'daily', time: form.time, schedDate: toDay(), assignedTo: form.assignedTo, notes: form.notes, status: 'pending', createdBy: currentUser.name, createdAt: new Date().toISOString(), activityLog: [] };
    await save('workdesk-tasks', [...tasks, obj]);
    await logAct('TASK ASSIGNED BY STAFF', form.name);
    setMsg('✅ Task assigned successfully!');
    setForm({ name: '', dept: '', priority: 'medium', time: '', assignedTo: [], notes: '' });
  }

  function toggleEmp(name) { setForm((f) => ({ ...f, assignedTo: f.assignedTo.includes(name) ? f.assignedTo.filter((x) => x !== name) : [...f.assignedTo, name] })); }

  const deptEmps = form.dept ? employees.filter((e) => e.dept === form.dept) : employees;

  return (
    <div>
      <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d', marginBottom: 20 }}>📋 Assign Task</h2>

      {msg && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 9, background: msg.startsWith('✅') ? '#d4edda' : '#fde8e8', color: msg.startsWith('✅') ? '#1a7a4a' : '#c0392b', fontWeight: 700, fontSize: 13 }}>{msg}</div>}

      <div style={{ background: 'white', borderRadius: 14, border: '1px solid #d8e2ef', padding: 22 }}>
        <Field label="Task Name *"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="WHAT NEEDS TO BE DONE" style={IS} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Department *"><select value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value, assignedTo: [] })} style={IS}><option value="">Select...</option>{depts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}</select></Field>
          <Field label="Priority"><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} style={IS}><option value="medium">🟡 MEDIUM</option><option value="high">🔴 HIGH</option><option value="low">🟢 LOW</option></select></Field>
          <Field label="Scheduled Time"><input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} style={IS} /></Field>
        </div>
        <Field label="Assign To">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 6, marginTop: 4 }}>
            {deptEmps.map((e) => (
              <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '7px 10px', borderRadius: 7, background: form.assignedTo.includes(e.name) ? '#e8f8ef' : '#f3f7fc', border: `1px solid ${form.assignedTo.includes(e.name) ? '#86efac' : '#d8e2ef'}` }}>
                <input type="checkbox" checked={form.assignedTo.includes(e.name)} onChange={() => toggleEmp(e.name)} style={{ accentColor: '#0d7377' }} />
                {e.name}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Notes (Optional)"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="ADDITIONAL INSTRUCTIONS..." style={{ ...IS, minHeight: 60, resize: 'vertical' }} /></Field>
        <button onClick={handleSubmit} style={{ padding: '10px 24px', borderRadius: 9, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>📋 Assign Task</button>
      </div>
    </div>
  );
}
