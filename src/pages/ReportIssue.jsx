import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { uid, toDay, notifyAdmins } from '../utils';

const IS = { width: '100%', padding: '9px 13px', borderRadius: 8, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 13, color: '#1a2535', outline: 'none', background: 'white', fontWeight: 600 };
function Field({ label, children }) {
  return <div style={{ marginBottom: 13 }}><label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</label>{children}</div>;
}

export default function ReportIssue() {
  const { currentUser } = useAuth();
  const { issues, depts, notices, save, logAct } = useApp();
  const [form, setForm] = useState({ title: '', dept: currentUser.dept || '', priority: 'medium', desc: '' });
  const [msg, setMsg] = useState('');

  async function handleSubmit() {
    if (!form.title.trim() || !form.dept) { setMsg('❌ Title and Department required!'); return; }
    const obj = { id: uid(), title: form.title.toUpperCase(), dept: form.dept, priority: form.priority, reporter: currentUser.name.toUpperCase(), assigned: '', desc: form.desc, status: 'open', date: toDay(), resolveRemark: '', resolveBy: '', resolvedAt: '' };
    await save('workdesk-issues', [...issues, obj]);
    await logAct('ISSUE REPORTED BY STAFF', form.title);
    // Notify main admin bell — high priority issues marked with red icon
    try {
      await notifyAdmins({
        notices, save,
        subject: form.priority === 'high' ? `🔴 URGENT: ${currentUser.name} reported — ${obj.title}` : `⚠️ ${currentUser.name} reported: ${obj.title}`,
        message: `Issue: ${obj.title}\nDepartment: ${obj.dept}\nPriority: ${form.priority.toUpperCase()}\nReported By: ${obj.reporter}\nDescription: ${form.desc || '—'}`,
        type: 'issue_reported',
        meta: { issueId: obj.id, reporter: obj.reporter, priority: form.priority, title: obj.title },
      });
    } catch (e) { console.error('Admin notify failed:', e); }
    setMsg('✅ Issue reported successfully! Admin will be notified.');
    setForm({ title: '', dept: currentUser.dept || '', priority: 'medium', desc: '' });
  }

  return (
    <div>
      <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d', marginBottom: 20 }}>⚠️ Report a Problem</h2>
      {msg && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 9, background: msg.startsWith('✅') ? '#d4edda' : '#fde8e8', color: msg.startsWith('✅') ? '#1a7a4a' : '#c0392b', fontWeight: 700, fontSize: 13 }}>{msg}</div>}
      <div style={{ background: 'white', borderRadius: 14, border: '1px solid #d8e2ef', padding: 22 }}>
        <Field label="Issue / Problem Title *"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="DESCRIBE IN ONE LINE" style={IS} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Department *"><select value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value })} style={IS}><option value="">Select...</option>{depts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}</select></Field>
          <Field label="Priority"><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} style={IS}><option value="medium">🟡 MEDIUM</option><option value="high">🔴 HIGH — URGENT!</option><option value="low">🟢 LOW</option></select></Field>
        </div>
        <Field label="Full Description"><textarea value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="FULL DETAILS OF THE PROBLEM..." style={{ ...IS, minHeight: 100, resize: 'vertical' }} /></Field>
        <Field label="Reported By"><input disabled value={currentUser.name.toUpperCase()} style={{ ...IS, background: '#f5f8fc', color: '#6b7a90' }} /></Field>
        <button onClick={handleSubmit} style={{ padding: '10px 24px', borderRadius: 9, background: '#c0392b', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>⚠️ Submit Report</button>
      </div>
    </div>
  );
}
