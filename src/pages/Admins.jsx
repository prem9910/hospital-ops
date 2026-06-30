import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { uid } from '../utils';
import { ALL_PERMS } from '../constants';
import { Modal } from '../components/common/Modal';
import { Alert, EmptyState } from '../components/common/Alert';

const IS = { width: '100%', padding: '9px 13px', borderRadius: 8, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 13, color: '#1a2535', outline: 'none', background: 'white', fontWeight: 600 };
function Field({ label, children }) {
  return <div style={{ marginBottom: 13 }}><label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</label>{children}</div>;
}

export default function Admins() {
  const { currentRole } = useAuth();
  const { admins, save, logAct } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editAdmin, setEditAdmin] = useState(null);
  const [showPerms, setShowPerms] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', name: '' });
  const [perms, setPerms] = useState([]);

  if (currentRole !== 'mainadmin') return <Alert variant="red">Only Main Admin can access this page!</Alert>;

  function openNew() { setForm({ username: '', password: '', name: '' }); setPerms([]); setEditAdmin(null); setShowForm(true); }
  function openEdit(a) { setForm({ username: a.username, password: a.password || '', name: a.name || '' }); setPerms(a.perms || []); setEditAdmin(a); setShowForm(true); }

  async function handleSave() {
    if (!form.username.trim()) { alert('Username required!'); return; }
    if (!editAdmin && !form.password.trim()) { alert('Password required!'); return; }
    const obj = { id: editAdmin?.id || uid(), username: form.username.toUpperCase().trim(), password: form.password || editAdmin?.password || '', name: form.name.toUpperCase(), perms };
    const newAdmins = editAdmin ? admins.map((a) => a.id === obj.id ? obj : a) : [...admins, obj];
    await save('workdesk-admins', newAdmins);
    await logAct(editAdmin ? 'ADMIN UPDATED' : 'ADMIN ADDED', obj.username);
    setShowForm(false);
  }

  async function handleDelete(a) {
    if (!confirm(`Delete admin ${a.username}?`)) return;
    await save('workdesk-admins', admins.filter((x) => x.id !== a.id));
    await logAct('ADMIN DELETED', a.username);
  }

  function togglePerm(p) { setPerms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]); }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>Admin List 👨‍💼</h2>
        <button onClick={openNew} style={{ padding: '7px 14px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>+ Add Admin</button>
      </div>

      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Username', 'Name', 'Perms', 'Actions'].map((h) => <th key={h} style={{ background: '#f3f7fc', padding: '9px 14px', textAlign: 'left', fontSize: 10.5, fontWeight: 800, color: '#6b7a90', letterSpacing: 0.8, textTransform: 'uppercase', borderBottom: '1px solid #d8e2ef' }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {admins.length ? admins.map((a) => (
              <tr key={a.id} onMouseEnter={(e) => e.currentTarget.style.background = '#f8fbff'} onMouseLeave={(e) => e.currentTarget.style.background = 'white'}>
                <td style={{ padding: '11px 14px', fontWeight: 800 }}>👨‍💼 {a.username}</td>
                <td style={{ padding: '11px 14px', fontSize: 13 }}>{a.name || '—'}</td>
                <td style={{ padding: '11px 14px' }}>
                  <button onClick={() => setShowPerms(a)} style={{ padding: '4px 10px', borderRadius: 7, background: '#e8f4fd', color: '#0d7377', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>
                    📋 {(a.perms || []).length} perms
                  </button>
                </td>
                <td style={{ padding: '11px 14px' }}>
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button onClick={() => openEdit(a)} style={{ padding: '4px 10px', borderRadius: 7, background: '#e8f4fd', color: '#0d7377', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>✏️ Edit</button>
                    <button onClick={() => handleDelete(a)} style={{ padding: '4px 9px', borderRadius: 7, background: 'transparent', border: '1px solid #d8e2ef', cursor: 'pointer', fontSize: 12, color: '#c0392b' }}>🗑️</button>
                  </div>
                </td>
              </tr>
            )) : <tr><td colSpan={4}><EmptyState icon="👨‍💼" message="NO ADMINS FOUND" /></td></tr>}
          </tbody>
        </table>
      </div>

      {/* Perms View Modal */}
      <Modal open={!!showPerms} onClose={() => setShowPerms(null)} title={`Permissions: ${showPerms?.username}`}>
        {showPerms && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ALL_PERMS.map((p) => (
            <span key={p.id} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: (showPerms.perms || []).includes(p.id) ? '#d4edda' : '#f3f7fc', color: (showPerms.perms || []).includes(p.id) ? '#1a7a4a' : '#9ca3af' }}>
              {(showPerms.perms || []).includes(p.id) ? '✅' : '❌'} {p.label}
            </span>
          ))}
        </div>}
      </Modal>

      {/* Add/Edit Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editAdmin ? 'Edit Admin' : 'Add Admin'}>
        <Field label="Username *"><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="LOGIN USERNAME" style={IS} /></Field>
        <Field label="Display Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="FULL NAME" style={IS} /></Field>
        <Field label={editAdmin ? "Password (blank = no change)" : "Password *"}><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="SET PASSWORD" style={IS} /></Field>
        <div style={{ marginBottom: 13 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Permissions</label>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <button type="button" onClick={() => setPerms(ALL_PERMS.map((p) => p.id))} style={{ fontSize: 11, color: '#0d7377', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>✅ Select All</button>
            <button type="button" onClick={() => setPerms([])} style={{ fontSize: 11, color: '#c0392b', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>✖ Clear All</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {ALL_PERMS.map((p) => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 9px', borderRadius: 7, background: perms.includes(p.id) ? '#e8f8ef' : '#f3f7fc', border: `1px solid ${perms.includes(p.id) ? '#86efac' : '#d8e2ef'}` }}>
                <input type="checkbox" checked={perms.includes(p.id)} onChange={() => togglePerm(p.id)} style={{ accentColor: '#0d7377' }} />
                {p.label}
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid #d8e2ef' }}>
          <button onClick={handleSave} style={{ padding: '9px 18px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>💾 Save Admin</button>
          <button onClick={() => setShowForm(false)} style={{ padding: '9px 18px', borderRadius: 8, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}
