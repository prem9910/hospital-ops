import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';

function useDarkTheme() {
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setDark(document.documentElement.getAttribute('data-theme') === 'dark');
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const cardRef = useRef(null);
  const screenRef = useRef(null);
  const isDark = useDarkTheme();

  const { currentRole, adminLogin, staffLogin, savedStaffName } = useAuth();
  const { employees, loaded } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (currentRole) navigate('/dashboard', { replace: true });
  }, [currentRole]);

  useEffect(() => {
    if (savedStaffName) setForm((f) => ({ ...f, username: savedStaffName }));
  }, [savedStaffName]);

  // 3D tilt
  useEffect(() => {
    const screen = screenRef.current;
    const card = cardRef.current;
    if (!screen || !card) return;
    const handle = (e) => {
      const r = screen.getBoundingClientRect();
      const dx = (e.clientX - r.left - r.width / 2) / (r.width / 2);
      const dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
      card.style.transform = `rotateX(${(-dy * 5).toFixed(2)}deg) rotateY(${(dx * 5).toFixed(2)}deg) scale(1.01)`;
    };
    const reset = () => { card.style.transform = 'rotateX(0deg) rotateY(0deg) scale(1)'; };
    screen.addEventListener('mousemove', handle);
    screen.addEventListener('mouseleave', reset);
    return () => { screen.removeEventListener('mousemove', handle); screen.removeEventListener('mouseleave', reset); };
  }, []);

  // CapsLock
  useEffect(() => {
    const handler = (e) => { if (e.getModifierState) setCapsLock(e.getModifierState('CapsLock')); };
    document.addEventListener('keydown', handler);
    document.addEventListener('keyup', handler);
    return () => { document.removeEventListener('keydown', handler); document.removeEventListener('keyup', handler); };
  }, []);

  function handleLogin(e) {
    e.preventDefault();
    if (!loaded) { setError('Loading data, please wait...'); return; }
    setError('');
    const u = form.username.trim();
    const p = form.password;
    const adminRes = adminLogin(u, p);
    if (adminRes.ok) { navigate('/dashboard', { replace: true }); return; }
    const staffRes = staffLogin(u, p, employees);
    if (staffRes.ok) { navigate('/dashboard', { replace: true }); return; }
    setError('Invalid username or password. Please try again.');
  }

  // ── Simple plus-sign background pattern ──────────────────────────────────────
  const lightPatternSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52">
    <line x1="26" y1="18" x2="26" y2="34" stroke="rgba(13,115,119,0.13)" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="18" y1="26" x2="34" y2="26" stroke="rgba(13,115,119,0.13)" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;

  const darkPatternSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52">
    <line x1="26" y1="18" x2="26" y2="34" stroke="rgba(20,165,171,0.22)" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="18" y1="26" x2="34" y2="26" stroke="rgba(20,165,171,0.22)" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;

  const patternUrl = `url("data:image/svg+xml,${encodeURIComponent(isDark ? darkPatternSvg : lightPatternSvg)}")`;

  // Theme-based values
  const bg = isDark
    ? 'linear-gradient(145deg, #060d1a 0%, #0b1e3d 40%, #091628 70%, #04101f 100%)'
    : 'linear-gradient(145deg, #f0f7ff 0%, #e8f4fd 40%, #f5f9ff 70%, #eef2f7 100%)';


  const orbs = isDark ? [
    { size: 420, top: '-130px', left: '-130px', bg: 'rgba(13,115,119,0.22)', dur: '13s' },
    { size: 300, bottom: '0', right: '-80px', bg: 'rgba(20,165,171,0.18)', dur: '10s' },
    { size: 200, bottom: '25%', left: '4%', bg: 'rgba(245,200,66,0.12)', dur: '15s' },
    { size: 160, top: '20%', right: '10%', bg: 'rgba(13,115,119,0.15)', dur: '11s' },
  ] : [
    { size: 400, top: '-120px', left: '-120px', bg: 'rgba(13,115,119,0.07)', dur: '13s' },
    { size: 280, bottom: '0', right: '-80px', bg: 'rgba(59,130,246,0.06)', dur: '10s' },
    { size: 200, bottom: '30%', left: '3%', bg: 'rgba(16,185,129,0.07)', dur: '15s' },
    { size: 140, top: '25%', right: '12%', bg: 'rgba(245,158,11,0.05)', dur: '11s' },
  ];

  const cardBg = isDark ? '#0d1f3c' : '#ffffff';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';
  const cardShadow = isDark
    ? '0 4px 6px rgba(0,0,0,0.4), 0 20px 60px rgba(0,0,0,0.5)'
    : '0 4px 6px rgba(0,0,0,0.04), 0 20px 60px rgba(13,115,119,0.1)';
  const titleColor = isDark ? '#e2e8f0' : '#0b1e3d';
  const subtitleColor = isDark ? 'rgba(255,255,255,0.3)' : '#94a3b8';
  const labelColor = isDark ? 'rgba(255,255,255,0.5)' : '#64748b';
  const inputBg = isDark ? '#0b1a2e' : '#ffffff';
  const inputBorder = isDark ? 'rgba(255,255,255,0.12)' : '#d1d5db';
  const inputColor = isDark ? '#e2e8f0' : '#1e293b';
  const footerColor = isDark ? 'rgba(255,255,255,0.2)' : '#cbd5e1';
  const accentLine = isDark
    ? 'linear-gradient(90deg, transparent, #14a5ab, #f5c842, transparent)'
    : 'linear-gradient(90deg, transparent, #0d7377, #14a5ab, transparent)';

  return (
    <div
      ref={screenRef}
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden', perspective: '1400px',
        background: bg, transition: 'background 0.4s ease',
        fontFamily: "'Nunito', sans-serif",
      }}
    >
      {/* Medical SVG pattern tile */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: patternUrl,
        backgroundRepeat: 'repeat',
        backgroundSize: '52px 52px',
        transition: 'opacity 0.4s',
      }} />

      {/* Orbs */}
      {orbs.map((o, i) => (
        <div key={i} style={{
          position: 'absolute', borderRadius: '50%', width: o.size, height: o.size,
          top: o.top, bottom: o.bottom, left: o.left, right: o.right,
          background: o.bg, filter: 'blur(70px)', pointerEvents: 'none', zIndex: 0,
          animation: `orbFloat ${o.dur} ease-in-out infinite alternate`,
          transition: 'background 0.4s',
        }} />
      ))}

      {/* Floating particles (dark mode) */}
      {isDark && [
        { w: 3, h: 3, top: '15%', left: '20%', dur: '4s', delay: '0s' },
        { w: 2, h: 2, top: '35%', left: '80%', dur: '5s', delay: '1s' },
        { w: 4, h: 4, top: '65%', left: '15%', dur: '6s', delay: '0.5s' },
        { w: 2, h: 2, top: '80%', left: '70%', dur: '4.5s', delay: '2s' },
        { w: 3, h: 3, top: '50%', left: '90%', dur: '5.5s', delay: '1.5s' },
      ].map((p, i) => (
        <div key={i} style={{
          position: 'absolute', borderRadius: '50%', width: p.w, height: p.h,
          top: p.top, left: p.left, zIndex: 1, pointerEvents: 'none',
          background: i % 2 === 0 ? 'rgba(20,165,171,0.7)' : 'rgba(245,200,66,0.6)',
          boxShadow: i % 2 === 0 ? '0 0 8px rgba(20,165,171,0.8)' : '0 0 8px rgba(245,200,66,0.7)',
          animation: `particleFloat ${p.dur} ease-in-out infinite alternate`,
          animationDelay: p.delay,
        }} />
      ))}

      <style>{`
        @keyframes orbFloat { 0%{transform:translateY(0) scale(1)} 100%{transform:translateY(-28px) scale(1.04)} }
        @keyframes cardEntry { from{opacity:0;transform:translateY(36px) scale(0.96)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes logoFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
        @keyframes particleFloat { 0%{transform:translateY(0) scale(1);opacity:0.7} 100%{transform:translateY(-20px) scale(1.2);opacity:1} }
        .login-inp {
          width: 100%; padding: 11px 14px; border-radius: 10px;
          border: 1.5px solid ${inputBorder};
          background: ${inputBg}; color: ${inputColor};
          font-family: 'Nunito', sans-serif;
          font-size: 13.5px; font-weight: 600; outline: none;
          transition: border-color 0.2s, box-shadow 0.2s, background 0.3s; box-sizing: border-box;
        }
        .login-inp:focus { border-color: #0d7377; box-shadow: 0 0 0 3px rgba(13,115,119,0.18); }
        .login-inp::placeholder { color: ${isDark ? 'rgba(255,255,255,0.2)' : '#9ca3af'}; }
        .login-btn {
          width: 100%; padding: 13px; border-radius: 10px; border: none; cursor: pointer;
          font-family: 'Nunito', sans-serif; font-size: 14px; font-weight: 900;
          text-transform: uppercase; letter-spacing: 0.8px;
          background: linear-gradient(135deg, #0d7377, #14a5ab);
          color: white; box-shadow: 0 4px 18px rgba(13,115,119,${isDark ? '0.45' : '0.3'});
          transition: all 0.22s;
        }
        .login-btn:hover { box-shadow: 0 6px 26px rgba(13,115,119,0.55); transform: translateY(-2px); }
        .pw-wrap { position: relative; }
        .pw-eye { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; padding: 4px; color: ${isDark ? 'rgba(255,255,255,0.3)' : '#9ca3af'}; font-size: 16px; line-height: 1; transition: color 0.2s; }
        .pw-eye:hover { color: #0d7377; }
      `}</style>

      <div ref={cardRef} style={{ position: 'relative', zIndex: 2, transformStyle: 'preserve-3d', transition: 'transform 0.08s ease-out' }}>
        <div style={{
          background: cardBg,
          border: `1px solid ${cardBorder}`,
          borderRadius: 22,
          padding: '40px 38px',
          width: 400, maxWidth: '94vw',
          boxShadow: cardShadow,
          animation: 'cardEntry 0.6s cubic-bezier(.22,.68,0,1.1) both',
          position: 'relative',
          transition: 'background 0.3s, box-shadow 0.3s',
        }}>
          {/* Top accent line */}
          <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: 3, background: accentLine, borderRadius: '0 0 4px 4px', transition: 'background 0.3s' }} />

          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <span style={{ display: 'inline-block', marginBottom: 12, filter: isDark ? 'drop-shadow(0 0 18px rgba(20,165,171,0.5))' : 'drop-shadow(0 6px 16px rgba(13,115,119,0.25))' }}>
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="wdGrad" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#0d7377"/>
                    <stop offset="100%" stopColor="#14a5ab"/>
                  </linearGradient>
                </defs>
                <rect x="3" y="3" width="50" height="50" rx="14" fill="url(#wdGrad)"/>
                <rect x="13" y="16" width="30" height="24" rx="3" fill="white" fillOpacity="0.96"/>
                <rect x="13" y="16" width="30" height="6" rx="3" fill="white" fillOpacity="0.7"/>
                <line x1="18" y1="27" x2="34" y2="27" stroke="#0d7377" strokeWidth="2.2" strokeLinecap="round"/>
                <line x1="18" y1="32" x2="30" y2="32" stroke="#0d7377" strokeWidth="2.2" strokeLinecap="round" opacity="0.55"/>
                <line x1="18" y1="37" x2="26" y2="37" stroke="#0d7377" strokeWidth="2.2" strokeLinecap="round" opacity="0.35"/>
              </svg>
            </span>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: titleColor, marginBottom: 5, transition: 'color 0.3s' }}>Work Desk</h1>
            <p style={{ fontSize: 10, color: subtitleColor, letterSpacing: 2.5, textTransform: 'uppercase', transition: 'color 0.3s' }}>Operations Management Platform</p>
          </div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 15 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: labelColor, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 7, transition: 'color 0.3s' }}>Username / Name</label>
              <input
                className="login-inp"
                value={form.username}
                onChange={(e) => { setForm({ ...form, username: e.target.value }); setError(''); }}
                placeholder="Enter your username or name"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: labelColor, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 7, transition: 'color 0.3s' }}>Password</label>
              <div className="pw-wrap">
                <input
                  className="login-inp"
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => { setForm({ ...form, password: e.target.value }); setError(''); }}
                  placeholder="••••••••"
                  style={{ paddingRight: 44 }}
                />
                <button type="button" className="pw-eye" onClick={() => setShowPw((s) => !s)} tabIndex={-1}>
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {capsLock && (
              <div style={{ color: '#d97706', fontSize: 11, marginBottom: 10, textAlign: 'center', background: isDark ? 'rgba(217,119,6,0.15)' : '#fffbeb', padding: '6px 12px', borderRadius: 8, border: `1px solid ${isDark ? 'rgba(217,119,6,0.3)' : '#fde68a'}` }}>
                ⚠️ Caps Lock is ON
              </div>
            )}
            {error && (
              <div style={{ color: '#f87171', fontSize: 12, marginBottom: 10, textAlign: 'center', background: isDark ? 'rgba(239,68,68,0.12)' : '#fef2f2', padding: '8px 12px', borderRadius: 8, border: `1px solid ${isDark ? 'rgba(239,68,68,0.25)' : '#fecaca'}` }}>
                {error}
              </div>
            )}

            <button type="submit" className="login-btn" style={{ marginTop: 10 }}>
              🔓 Login
            </button>
          </form>

          <div style={{ fontSize: 11, color: footerColor, textAlign: 'center', marginTop: 18, transition: 'color 0.3s' }}>
            Admin · Staff · Main Admin — same login
          </div>
        </div>
      </div>
    </div>
  );
}
