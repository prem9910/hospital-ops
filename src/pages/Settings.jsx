import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { Alert } from '../components/common/Alert';

const IS = { width: '100%', padding: '9px 13px', borderRadius: 8, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 13, color: '#1a2535', outline: 'none', background: 'white', fontWeight: 600 };

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 15 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ background: 'white', borderRadius: 14, border: '1px solid #d8e2ef', padding: 22, marginBottom: 18 }}>
      <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: '#0b1e3d', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid #f0f4f8' }}>{title}</h3>
      {children}
    </div>
  );
}

function CopyBtn({ text, label = '📋 Copy' }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{ padding: '4px 12px', borderRadius: 6, background: copied ? '#d4edda' : '#f3f7fc', border: `1px solid ${copied ? '#86efac' : '#d8e2ef'}`, color: copied ? '#1a7a4a' : '#4a5568', fontSize: 11, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
    >
      {copied ? '✅ Copied!' : label}
    </button>
  );
}

// ── EmailJS template definitions ──────────────────────────────────────────────
// Body of every EmailJS template = {{{message_html}}}  (triple braces)
// Subject is set per-template below.

export default function Settings() {
  const { currentRole, currentUser } = useAuth();
  const { employees, admins, save, logAct } = useApp();

  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwMsg,  setPwMsg]  = useState('');
  const [showPw, setShowPw] = useState(false);

  const [profileForm, setProfileForm] = useState({ contact: '', email: '' });
  const [profileMsg,  setProfileMsg]  = useState('');

  useEffect(() => {
    if (currentRole !== 'staff' && currentRole !== 'admin') return;
    const emp = employees.find(e => e.id === currentUser.empId);
    if (emp) setProfileForm({ contact: emp.contact || '', email: emp.email || '' });
  }, [employees, currentUser.empId, currentRole]);

  const saved = (() => { try { return JSON.parse(localStorage.getItem('hops-emailcfg') || '{}'); } catch { return {}; } })();
  const [emailForm, setEmailForm] = useState({
    hospitalName: saved.hospitalName || 'Hospital Operations',
  });
  const [emailMsg, setEmailMsg] = useState('');

  // Brevo config state
  const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
  const [brevoForm, setBrevoForm] = useState({ apiKey: '', senderEmail: '', senderName: '' });
  const [brevoMasked, setBrevoMasked] = useState({ apiKey: '', senderEmail: '', senderName: '', configured: false });
  const [brevoMsg, setBrevoMsg] = useState('');
  const [brevoLoading, setBrevoLoading] = useState(false);
  const [showBrevo, setShowBrevo] = useState({ apiKey: false, senderEmail: false });

  useEffect(() => {
    if (currentRole !== 'mainadmin') return;
    fetch(`${SERVER}/api/email/config`)
      .then(r => r.json())
      .then(d => setBrevoMasked(d))
      .catch(() => {});
  }, [currentRole]);

  async function saveBrevoConfig() {
    const payload = {};
    if (brevoForm.apiKey.trim())      payload.apiKey      = brevoForm.apiKey.trim();
    if (brevoForm.senderEmail.trim()) payload.senderEmail = brevoForm.senderEmail.trim();
    if (brevoForm.senderName.trim())  payload.senderName  = brevoForm.senderName.trim();
    if (!Object.keys(payload).length) { setBrevoMsg('❌ Please enter at least one field to update!'); return; }
    setBrevoLoading(true);
    try {
      const r = await fetch(`${SERVER}/api/email/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error();
      setBrevoMsg('✅ Configuration saved! Please restart the server.');
      setBrevoForm({ apiKey: '', senderEmail: '', senderName: '' });
      const d = await fetch(`${SERVER}/api/email/config`).then(r2 => r2.json());
      setBrevoMasked(d);
      await logAct('BREVO CONFIG UPDATED', '');
    } catch {
      setBrevoMsg('❌ Could not connect to the server.');
    } finally {
      setBrevoLoading(false);
    }
  }

  async function saveProfile() {
    const emp = employees.find(e => e.id === currentUser.empId);
    if (!emp) { setProfileMsg('❌ Employee record not found!'); return; }
    await save('hops-employees', employees.map(e =>
      e.id === emp.id ? { ...e, contact: profileForm.contact, email: profileForm.email } : e
    ));
    await logAct('PROFILE UPDATED', currentUser.name);
    setProfileMsg('✅ Profile updated successfully!');
  }

  async function changePw() {
    if (!pwForm.newPw.trim())                    { setPwMsg('❌ Password required!');      return; }
    if (pwForm.newPw !== pwForm.confirm)          { setPwMsg('❌ Passwords do not match!'); return; }
    if (currentRole === 'staff') {
      const emp = employees.find(e => e.name === currentUser.name);
      if (!emp)                                  { setPwMsg('❌ Employee not found!');      return; }
      if (emp.password !== pwForm.current)        { setPwMsg('❌ Current password wrong!'); return; }
      await save('hops-employees', employees.map(e => e.id === emp.id ? { ...e, password: pwForm.newPw } : e));
    } else if (currentRole === 'admin') {
      const adm = admins.find(a => a.username === currentUser.name);
      if (!adm)                                  { setPwMsg('❌ Admin not found!');         return; }
      if (adm.password !== pwForm.current)        { setPwMsg('❌ Current password wrong!'); return; }
      await save('hops-admins', admins.map(a => a.id === adm.id ? { ...a, password: pwForm.newPw } : a));
    } else {
      setPwMsg('❌ Main admin password is hardcoded — change in constants/index.js'); return;
    }
    await logAct('PASSWORD CHANGED', currentUser.name);
    setPwMsg('✅ Password changed successfully!');
    setPwForm({ current: '', newPw: '', confirm: '' });
  }

  async function saveEmailCfg() {
    localStorage.setItem('hops-emailcfg', JSON.stringify(emailForm));
    setEmailMsg('✅ Email config saved!');
    await logAct('EMAIL CONFIG UPDATED', '');
  }


  return (
    <div>
      <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d', marginBottom: 20 }}>⚙️ Settings</h2>

      {/* ── My Profile — staff/admin only ── */}
      {(currentRole === 'staff' || currentRole === 'admin') && (
        <Card title="👤 My Profile">
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: '#f3f7fc', border: '1px solid #e4eaf2' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, color: '#6b7a90', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>Name</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1a2535' }}>{currentUser.name}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, color: '#6b7a90', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>Department</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1a2535' }}>{currentUser.dept || '—'}</div>
            </div>
          </div>
          {profileMsg && (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: profileMsg.startsWith('✅') ? '#d4edda' : '#fde8e8', color: profileMsg.startsWith('✅') ? '#1a7a4a' : '#c0392b', fontWeight: 700, fontSize: 12 }}>
              {profileMsg}
            </div>
          )}
          <Field label="Contact / Phone">
            <input value={profileForm.contact} onChange={e => setProfileForm({ ...profileForm, contact: e.target.value })} placeholder="PHONE NUMBER" style={IS} />
          </Field>
          <Field label="Email">
            <input value={profileForm.email} onChange={e => setProfileForm({ ...profileForm, email: e.target.value })} placeholder="EMAIL ADDRESS" style={IS} />
          </Field>
          <button onClick={saveProfile} style={{ padding: '9px 20px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>💾 Save Profile</button>
        </Card>
      )}

      {/* ── Password ── */}
      <Card title="🔐 Change Password">
        {pwMsg && (
          <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: pwMsg.startsWith('✅') ? '#d4edda' : '#fde8e8', color: pwMsg.startsWith('✅') ? '#1a7a4a' : '#c0392b', fontWeight: 700, fontSize: 12 }}>
            {pwMsg}
          </div>
        )}
        <Field label="Current Password">
          <input type={showPw ? 'text' : 'password'} value={pwForm.current} onChange={e => setPwForm({ ...pwForm, current: e.target.value })} placeholder="CURRENT PASSWORD" style={IS} />
        </Field>
        <Field label="New Password">
          <input type={showPw ? 'text' : 'password'} value={pwForm.newPw} onChange={e => setPwForm({ ...pwForm, newPw: e.target.value })} placeholder="NEW PASSWORD" style={IS} />
        </Field>
        <Field label="Confirm New Password">
          <input type={showPw ? 'text' : 'password'} value={pwForm.confirm} onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })} placeholder="CONFIRM NEW PASSWORD" style={IS} />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, marginBottom: 14 }}>
          <input type="checkbox" checked={showPw} onChange={e => setShowPw(e.target.checked)} style={{ accentColor: '#0d7377' }} /> Show Password
        </label>
        <button onClick={changePw} style={{ padding: '9px 20px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>🔐 Change Password</button>
      </Card>

      {/* ── EmailJS Config — mainadmin only ── */}
      {currentRole === 'mainadmin' && (<>

        <Card title="📧 Email Config (Brevo)">
          {emailMsg && (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#d4edda', color: '#1a7a4a', fontWeight: 700, fontSize: 12 }}>
              {emailMsg}
            </div>
          )}

          {/* Status badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '8px 12px', borderRadius: 8, background: brevoMasked.configured ? '#d4edda' : '#fff3cd', border: `1px solid ${brevoMasked.configured ? '#86efac' : '#ffc107'}` }}>
            <span style={{ fontSize: 16 }}>{brevoMasked.configured ? '✅' : '⚠️'}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: brevoMasked.configured ? '#1a7a4a' : '#856404' }}>
              {brevoMasked.configured ? 'Brevo is configured — emails are active' : 'Brevo is not yet configured — emails will not be sent'}
            </span>
          </div>

          {/* Current masked values */}
          {brevoMasked.configured && (
            <div style={{ background: '#f3f7fc', border: '1px solid #d8e2ef', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Current Config (masked)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontSize: 12, color: '#4a5568' }}>🔑 API Key: <code style={{ fontFamily: 'monospace', color: '#0d7377' }}>{brevoMasked.apiKey || '••••••••••••••'}</code></div>
                <div style={{ fontSize: 12, color: '#4a5568' }}>📧 Sender: <code style={{ fontFamily: 'monospace', color: '#0d7377' }}>{brevoMasked.senderEmail || '••••'}</code></div>
                <div style={{ fontSize: 12, color: '#4a5568' }}>🏥 Name: <span style={{ fontWeight: 700 }}>{brevoMasked.senderName || '—'}</span></div>
              </div>
            </div>
          )}

          {brevoMsg && (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: brevoMsg.startsWith('✅') ? '#d4edda' : '#f8d7da', color: brevoMsg.startsWith('✅') ? '#1a7a4a' : '#721c24', fontWeight: 700, fontSize: 12 }}>
              {brevoMsg}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* API Key */}
            <Field label="Brevo API Key">
              <div style={{ position: 'relative' }}>
                <input
                  type={showBrevo.apiKey ? 'text' : 'password'}
                  value={brevoForm.apiKey}
                  onChange={e => setBrevoForm({ ...brevoForm, apiKey: e.target.value })}
                  placeholder={brevoMasked.configured ? '(leave blank = no change)' : 'xkeysib-xxxxxxxx...'}
                  style={{ ...IS, paddingRight: 44 }}
                />
                <button type="button" onClick={() => setShowBrevo(s => ({ ...s, apiKey: !s.apiKey }))} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: '#6b7a90' }}>
                  {showBrevo.apiKey ? '🙈' : '👁️'}
                </button>
              </div>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Sender Email */}
              <Field label="Sender Email (Gmail)">
                <div style={{ position: 'relative' }}>
                  <input
                    type={showBrevo.senderEmail ? 'text' : 'password'}
                    value={brevoForm.senderEmail}
                    onChange={e => setBrevoForm({ ...brevoForm, senderEmail: e.target.value })}
                    placeholder={brevoMasked.configured ? '(no change)' : 'you@gmail.com'}
                    style={{ ...IS, paddingRight: 44 }}
                  />
                  <button type="button" onClick={() => setShowBrevo(s => ({ ...s, senderEmail: !s.senderEmail }))} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: '#6b7a90' }}>
                    {showBrevo.senderEmail ? '🙈' : '👁️'}
                  </button>
                </div>
              </Field>

              {/* Sender Name */}
              <Field label="Sender Name">
                <input
                  type="text"
                  value={brevoForm.senderName}
                  onChange={e => setBrevoForm({ ...brevoForm, senderName: e.target.value })}
                  placeholder={brevoMasked.senderName || 'Hospital Operations'}
                  style={IS}
                />
              </Field>
            </div>

            {/* Hospital Name */}
            <Field label="Hospital / Organization Name (shown in email footer)">
              <input value={emailForm.hospitalName} onChange={e => setEmailForm({ ...emailForm, hospitalName: e.target.value })} placeholder="Hospital Operations" style={IS} />
            </Field>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={saveBrevoConfig} disabled={brevoLoading} style={{ padding: '9px 20px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: brevoLoading ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13, opacity: brevoLoading ? 0.7 : 1 }}>
              {brevoLoading ? '⏳ Saving...' : '💾 Save Brevo Config'}
            </button>
            <button onClick={saveEmailCfg} style={{ padding: '9px 20px', borderRadius: 8, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
              💾 Save Hospital Name
            </button>
          </div>
        </Card>

      </>)}

      {/* ── System Info ── */}
      <Card title="ℹ️ System Info">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            ['Logged in as', currentUser.name],
            ['Role', currentRole.toUpperCase()],
            ['Department', currentUser.dept || '—'],
            ['Build', 'Hospital Ops v2.0'],
          ].map(([k, v]) => (
            <div key={k} style={{ background: '#f3f7fc', padding: '10px 13px', borderRadius: 9, border: '1px solid #e4eaf2' }}>
              <div style={{ fontSize: 10.5, color: '#6b7a90', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>{k}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1a2535' }}>{v}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
