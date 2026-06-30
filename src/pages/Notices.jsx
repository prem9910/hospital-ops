import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { uid } from '../utils';
import { Modal } from '../components/common/Modal';

const IS = { width: '100%', padding: '9px 13px', borderRadius: 8, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 13, color: '#1a2535', outline: 'none', background: 'white', fontWeight: 600 };
const BtnS = { padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13, color: 'white', fontFamily: "'Nunito',sans-serif" };

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
  const { notices, employees, depts, save, logAct } = useApp();
  const isMain = currentRole === 'mainadmin';

  // Send notice form (mainadmin only) — opens in a modal
  const [showSendModal, setShowSendModal] = useState(false);
  const [form, setForm] = useState({ dept: '', toEmpId: '', subject: '', message: '' });
  const [sendMsg, setSendMsg] = useState('');

  // Main admin: tab between Admin Alerts and Sent Notices
  const [adminTab, setAdminTab] = useState('alerts');

  function openSendModal() {
    setForm({ dept: '', toEmpId: '', subject: '', message: '' });
    setSendMsg('');
    setShowSendModal(true);
  }

  function closeSendModal() {
    setShowSendModal(false);
    setSendMsg('');
  }

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
    await save('workdesk-notices', [...notices, notice]);
    await logAct('NOTICE SENT', `To: ${emp.name} — ${form.subject}`);
    setSendMsg('✅ Notice sent successfully!');
    setTimeout(() => {
      closeSendModal();
    }, 800);
  }

  // Mark as read
  async function markRead(id) {
    await save('workdesk-notices', notices.map(n => n.id === id ? { ...n, isRead: true } : n));
  }

  // Main admin: all sent notices (general type, to employees)
  const myNotices = isMain
    ? notices.filter(n => (n.fromName === 'MAIN ADMIN') && n.toEmpId !== 'MAINADMIN').sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
    : notices.filter(n => n.toEmpId === currentUser?.empId).sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));

  // Admin alerts sent to MAINADMIN (e.g. employee completed all tasks)
  const adminAlerts = isMain
    ? notices.filter(n => n.toEmpId === 'MAINADMIN').sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
    : [];

  const unreadCount = myNotices.filter(n => !n.isRead).length;
  const unreadAlerts = adminAlerts.filter(n => !n.isRead).length;

  function fDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  async function markAlertRead(id) {
    await save('workdesk-notices', notices.map(n => n.id === id ? { ...n, isRead: true } : n));
  }

  const typeColors = {
    task_reminder: { bg: '#fff7ed', border: '#fed7aa', color: '#c2410c', label: '⏰ Task Reminder' },
    dept_change_approval: { bg: '#f0fdf4', border: '#86efac', color: '#166534', label: '🏢 Dept Change' },
    general: { bg: '#f0f7ff', border: '#bfdbfe', color: '#1d4ed8', label: '📋 Notice' },
    admin_alert: { bg: '#fef9c3', border: '#fde047', color: '#854d0e', label: '🔔 Alert' },
  };

  return (
    <div>
      {/* Page header — matches the pattern in Tasks.jsx (h2 on left, actions on right) */}
      <div className="page-header">
        <div>
          <h2 className="page-header-title" style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>
            {isMain ? 'Notices' : 'Notice History'}
          </h2>
          <div style={{ fontSize: 12, color: '#6b7a90', marginTop: 2 }}>
            {isMain
              ? `${adminAlerts.length} alert(s) · ${myNotices.length} notice(s) sent`
              : `${myNotices.length} total · ${unreadCount} unread`}
          </div>
        </div>
        <div className="page-header-actions">
          {isMain && (
            <button onClick={openSendModal} style={{ ...BtnS, background: '#0d7377' }}>
              📨 Send Notice
            </button>
          )}
        </div>
      </div>

      {/* Main admin: tabbed view (Admin Alerts / Sent Notices) */}
      {isMain ? (
        <div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '2px solid #d8e2ef' }}>
            {[
              { key: 'alerts', label: '🔔 Admin Alerts', count: adminAlerts.length, color: '#854d0e' },
              { key: 'sent', label: '📤 Sent Notices', count: myNotices.length, color: '#0d7377' },
            ].map((t) => {
              const isActive = adminTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setAdminTab(t.key)}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px 8px 0 0',
                    border: 'none',
                    borderBottom: isActive ? `3px solid ${t.color}` : '3px solid transparent',
                    background: isActive ? 'white' : 'transparent',
                    color: isActive ? t.color : '#6b7a90',
                    cursor: 'pointer',
                    fontWeight: 800,
                    fontSize: 13,
                    marginBottom: '-2px',
                    transition: 'all 0.15s',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span>{t.label}</span>
                  <span style={{
                    display: 'inline-block',
                    minWidth: 22,
                    padding: '2px 8px',
                    borderRadius: 12,
                    background: isActive ? t.color : '#d8e2ef',
                    color: isActive ? 'white' : '#6b7a90',
                    fontSize: 11,
                    fontWeight: 800,
                    lineHeight: 1.4,
                    textAlign: 'center',
                  }}>{t.count}</span>
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          {adminTab === 'alerts' ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, color: '#0b1e3d' }}>🔔 Admin Alerts</h3>
                {unreadAlerts > 0 && <span style={{ background: '#ef4444', color: 'white', borderRadius: 20, fontSize: 10, fontWeight: 800, padding: '2px 8px' }}>{unreadAlerts} new</span>}
              </div>
              {adminAlerts.length === 0 ? (
                <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e0e8f0', padding: '24px', textAlign: 'center', color: '#6b7a90', fontSize: 13 }}>📭 No alerts yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {adminAlerts.map(n => (
                    <div key={n.id} onClick={() => !n.isRead && markAlertRead(n.id)}
                      style={{ background: !n.isRead ? '#fffbeb' : 'white', borderRadius: 10, border: `1px solid ${!n.isRead ? '#fde047' : '#e0e8f0'}`, padding: '12px 16px', cursor: !n.isRead ? 'pointer' : 'default' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: '#854d0e', marginBottom: 3 }}>{n.subject}</div>
                          <div style={{ fontSize: 11, color: '#475569', whiteSpace: 'pre-wrap' }}>{n.message}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap' }}>{fDate(n.sentAt)}</div>
                          {n.isRead && <div style={{ fontSize: 10, color: '#22c55e', fontWeight: 700, marginTop: 3 }}>✓ Read</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              {myNotices.length === 0 ? (
                <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e0e8f0', padding: '36px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
                  <div style={{ fontSize: 13, color: '#6b7a90', fontWeight: 700 }}>No notices sent yet</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {myNotices.map(n => {
                    const tc = typeColors[n.type] || typeColors.general;
                    const isDeptApproval = n.type === 'dept_change_approval';
                    return (
                      <div key={n.id}
                        style={{ background: 'white', borderRadius: 12, border: `1px solid #e0e8f0`, padding: '14px 18px', transition: 'box-shadow 0.15s' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                              <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: tc.bg, color: tc.color, border: `1px solid ${tc.border}` }}>{tc.label}</span>
                              <span style={{ fontSize: 11, color: '#0d7377', fontWeight: 700 }}>→ {n.toName}</span>
                              {isDeptApproval && (
                                n.meta?.accepted
                                  ? <span style={{ fontSize: 9, fontWeight: 800, color: '#166534', background: '#dcfce7', padding: '2px 8px', borderRadius: 20 }}>✅ Accepted {n.meta.acceptedAt ? fDate(n.meta.acceptedAt) : ''}</span>
                                  : <span style={{ fontSize: 9, fontWeight: 800, color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: 20 }}>⏳ Pending</span>
                              )}
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#0b1e3d', marginBottom: 5 }}>{n.subject}</div>
                            <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{n.message}</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>{fDate(n.sentAt)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Employee view — Notice History (unchanged) */
        <div>
          {myNotices.length === 0 ? (
            <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e0e8f0', padding: '36px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
              <div style={{ fontSize: 13, color: '#6b7a90', fontWeight: 700 }}>No notice history yet</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {myNotices.map(n => {
                const tc = typeColors[n.type] || typeColors.general;
                const isUnread = !n.isRead;
                const isDeptApproval = n.type === 'dept_change_approval';
                return (
                  <div key={n.id} onClick={() => !n.isRead && !isDeptApproval && markRead(n.id)}
                    style={{ background: isUnread ? '#fafcff' : 'white', borderRadius: 12, border: `1px solid ${isUnread ? '#93c5fd' : '#e0e8f0'}`, padding: '14px 18px', cursor: isUnread && !isDeptApproval ? 'pointer' : 'default', transition: 'box-shadow 0.15s', boxShadow: isUnread ? '0 2px 10px rgba(13,115,119,0.08)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: tc.bg, color: tc.color, border: `1px solid ${tc.border}` }}>{tc.label}</span>
                          {isUnread && <span style={{ fontSize: 9, fontWeight: 800, color: '#1d4ed8', background: '#dbeafe', padding: '2px 7px', borderRadius: 20 }}>NEW</span>}
                          {isDeptApproval && (
                            n.meta?.accepted
                              ? <span style={{ fontSize: 9, fontWeight: 800, color: '#166534', background: '#dcfce7', padding: '2px 8px', borderRadius: 20 }}>✅ Accepted</span>
                              : <span style={{ fontSize: 9, fontWeight: 800, color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: 20 }}>⏳ Awaiting your acceptance</span>
                          )}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#0b1e3d', marginBottom: 5 }}>{n.subject}</div>
                        <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{n.message}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>{fDate(n.sentAt)}</div>
                        <div style={{ fontSize: 10, color: '#6b7a90', marginTop: 3 }}>From: {n.fromName}</div>
                        {n.isRead && !isDeptApproval && <div style={{ fontSize: 10, color: '#22c55e', fontWeight: 700, marginTop: 3 }}>✓ Read</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Send Notice Modal (main admin only) */}
      <Modal open={showSendModal} onClose={closeSendModal} title="📨 Send Notice" maxWidth="max-w-md">
        <Field label="Select Department *">
          <select value={form.dept} onChange={e => setForm({ ...form, dept: e.target.value, toEmpId: '' })} style={IS}>
            <option value="">— Select Department —</option>
            {depts.map(d => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Select Employee *">
          <select value={form.toEmpId} onChange={e => setForm({ ...form, toEmpId: e.target.value })} style={IS} disabled={!form.dept}>
            <option value="">— Select Employee —</option>
            {employees.filter(e => e.dept === form.dept).map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Subject *">
          <input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value.toUpperCase() })} placeholder="NOTICE SUBJECT..." style={IS} />
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
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={closeSendModal} style={{ ...BtnS, background: '#94a3b8' }}>Cancel</button>
          <button onClick={sendNotice} style={{ ...BtnS, background: '#0d7377' }}>📨 Send Notice</button>
        </div>
      </Modal>
    </div>
  );
}
