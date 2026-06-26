import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { uid } from '../utils';

const IS = { width: '100%', padding: '9px 13px', borderRadius: 8, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 13, color: '#1a2535', outline: 'none', background: 'white', fontWeight: 600 };

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

export default function Notices() {
  const { currentRole, currentUser } = useAuth();
  const { notices, employees, save, logAct } = useApp();
  const isMain = currentRole === 'mainadmin';

  // Send notice form (mainadmin only)
  const [form, setForm] = useState({ toEmpId: '', subject: '', message: '' });
  const [sendMsg, setSendMsg] = useState('');

  async function sendNotice() {
    if (!form.toEmpId || !form.subject.trim() || !form.message.trim()) {
      setSendMsg('❌ Please fill all fields.');
      return;
    }
    const emp = employees.find(e => e.id === form.toEmpId);
    if (!emp) return;
    const notice = {
      id: uid(),
      toEmpId: emp.id,
      toName: emp.name,
      fromName: currentUser?.name || 'MAIN ADMIN',
      subject: form.subject.trim(),
      message: form.message.trim(),
      type: 'general',
      isRead: false,
      sentAt: new Date().toISOString(),
    };
    await save('hops-notices', [...notices, notice]);
    await logAct('NOTICE SENT', `To: ${emp.name} — ${form.subject}`);
    setForm({ toEmpId: '', subject: '', message: '' });
    setSendMsg('✅ Notice sent successfully!');
    setTimeout(() => setSendMsg(''), 3000);
  }

  // Mark as read
  async function markRead(id) {
    await save('hops-notices', notices.map(n => n.id === id ? { ...n, isRead: true } : n));
  }

  async function markAllRead() {
    const myNotices = notices.filter(n => n.toEmpId === currentUser?.empId);
    if (!myNotices.some(n => !n.isRead)) return;
    await save('hops-notices', notices.map(n => n.toEmpId === currentUser?.empId ? { ...n, isRead: true } : n));
  }

  // Filter notices for current user
  const myNotices = isMain
    ? notices.filter(n => n.fromName === (currentUser?.name || 'MAIN ADMIN') || n.fromName === 'MAIN ADMIN').sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
    : notices.filter(n => n.toEmpId === currentUser?.empId).sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));

  const unreadCount = myNotices.filter(n => !n.isRead).length;

  function fDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  const typeColors = {
    task_reminder: { bg: '#fff7ed', border: '#fed7aa', color: '#c2410c', label: '⏰ Task Reminder' },
    general: { bg: '#f0f7ff', border: '#bfdbfe', color: '#1d4ed8', label: '📋 Notice' },
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMain ? '380px 1fr' : '1fr', gap: 20, alignItems: 'start' }}>
      {/* Send notice panel (mainadmin only) */}
      {isMain && (
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e0e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(11,30,61,0.06)', position: 'sticky', top: 0 }}>
          <div style={{ background: 'linear-gradient(135deg,#0d7377,#0b5e62)', padding: '16px 20px' }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, color: 'white', fontWeight: 700 }}>📨 Send Notice</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>Send a notice to any employee</div>
          </div>
          <div style={{ padding: '18px 20px' }}>
            <Field label="Select Employee *">
              <select value={form.toEmpId} onChange={e => setForm({ ...form, toEmpId: e.target.value })} style={IS}>
                <option value="">— Select Employee —</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.name}{e.dept ? ` (${e.dept})` : ''}</option>
                ))}
              </select>
            </Field>
            <Field label="Subject *">
              <input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Notice subject..." style={IS} />
            </Field>
            <Field label="Message *">
              <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} placeholder="Write your notice here..." rows={5}
                style={{ ...IS, resize: 'vertical', lineHeight: 1.6 }} />
            </Field>
            {sendMsg && (
              <div style={{ padding: '8px 12px', borderRadius: 8, marginBottom: 10, fontSize: 12, fontWeight: 700,
                background: sendMsg.startsWith('✅') ? '#f0fdf4' : '#fef2f2',
                color: sendMsg.startsWith('✅') ? '#166534' : '#c0392b',
                border: `1px solid ${sendMsg.startsWith('✅') ? '#86efac' : '#fecaca'}` }}>
                {sendMsg}
              </div>
            )}
            <button onClick={sendNotice} style={{ width: '100%', padding: '10px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
              📨 Send Notice
            </button>
          </div>
        </div>
      )}

      {/* Notices list */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, color: '#0b1e3d', marginBottom: 2 }}>
              {isMain ? '📤 Sent Notices' : '📬 My Notices'}
              {!isMain && unreadCount > 0 && (
                <span style={{ marginLeft: 10, background: '#ef4444', color: 'white', fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 20 }}>{unreadCount} new</span>
              )}
            </h2>
            <div style={{ fontSize: 12, color: '#6b7a90' }}>
              {isMain ? `${myNotices.length} notice(s) sent` : `${myNotices.length} notice(s) received`}
            </div>
          </div>
          {!isMain && unreadCount > 0 && (
            <button onClick={markAllRead} style={{ padding: '7px 14px', borderRadius: 8, background: '#f0f7ff', color: '#0d7377', border: '1px solid #cce0f0', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
              ✓ Mark All Read
            </button>
          )}
        </div>

        {myNotices.length === 0 ? (
          <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e0e8f0', padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 14, color: '#6b7a90', fontWeight: 700 }}>
              {isMain ? 'No notices sent yet' : 'No notices received'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {myNotices.map(n => {
              const tc = typeColors[n.type] || typeColors.general;
              const isUnread = !isMain && !n.isRead;
              return (
                <div key={n.id} onClick={() => !isMain && !n.isRead && markRead(n.id)}
                  style={{ background: isUnread ? '#fafcff' : 'white', borderRadius: 12, border: `1px solid ${isUnread ? '#93c5fd' : '#e0e8f0'}`, padding: '14px 18px', cursor: isUnread ? 'pointer' : 'default', transition: 'box-shadow 0.15s',
                    boxShadow: isUnread ? '0 2px 10px rgba(13,115,119,0.08)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: tc.bg, color: tc.color, border: `1px solid ${tc.border}` }}>
                          {tc.label}
                        </span>
                        {isUnread && <span style={{ fontSize: 9, fontWeight: 800, color: '#1d4ed8', background: '#dbeafe', padding: '2px 7px', borderRadius: 20 }}>NEW</span>}
                        {isMain && (
                          <span style={{ fontSize: 11, color: '#0d7377', fontWeight: 700 }}>→ {n.toName}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#0b1e3d', marginBottom: 5 }}>{n.subject}</div>
                      <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{n.message}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>{fDate(n.sentAt)}</div>
                      {!isMain && (
                        <div style={{ fontSize: 10, color: '#6b7a90', marginTop: 3 }}>From: {n.fromName}</div>
                      )}
                      {!isMain && n.isRead && (
                        <div style={{ fontSize: 10, color: '#22c55e', fontWeight: 700, marginTop: 3 }}>✓ Read</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
