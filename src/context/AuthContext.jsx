import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { ls } from '../utils';
import { MAIN_ADMIN_USER, MAIN_ADMIN_PASS, INACTIVITY_MS } from '../constants';

const AuthContext = createContext(null);

// Constant-time string comparison. Prevents a timing oracle from leaking
// how many leading characters of the typed password matched. Without this,
// a sophisticated attacker could brute-force the password one character at
// a time by measuring how long the comparison takes. Note: this is a
// browser-side mitigation only — full security requires server-side
// hashing (TODO: bcrypt/argon2 via Supabase Auth). The constant-time
// helper stops the *easier* client-side attack vector.
function timingSafeEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // Pad to equal length so the comparison runs in constant time regardless
  // of how many characters match.
  const len = Math.max(a.length, b.length, 1);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

export function AuthProvider({ children }) {
  // Lazy useState initializers read workdesk-session SYNCHRONOUSLY before the
  // first render — so the very first AppLayout render already sees a
  // populated currentRole/currentUser. Without this, AppLayout's
  // `if (!currentRole) return <Navigate to="/login" replace />` (line 45)
  // fires on the first render with currentRole === '' and bounces a logged-in
  // user to /login. After rehydration completes, Login's own effect redirects
  // to /dashboard unconditionally, dropping whatever deep-link the user was
  // on (/tasks, /settings, /employees, etc.) — making F5 feel like the whole
  // app reloaded.
  const [currentRole, setCurrentRole] = useState(() => {
    try {
      const s = ls.get('workdesk-session', null);
      return s?.role || '';
    } catch { return ''; }
  });
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const s = ls.get('workdesk-session', null);
      return s?.user?.name
        ? s.user
        : { name: '', dept: '', adminId: '', perms: {} };
    } catch { return { name: '', dept: '', adminId: '', perms: {} }; }
  });
  const [savedStaffName, setSavedStaffName] = useState(() => ls.get('workdesk-saved-staff-name', ''));
  const inactivityTimer = useRef(null);
  const inactivityInterval = useRef(null);
  const [inactivityPct, setInactivityPct] = useState(100);
  const [inactivityWarning, setInactivityWarning] = useState(false);
  const [inactivitySeconds, setInactivitySeconds] = useState(INACTIVITY_MS / 1000);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const currentRoleRef = useRef(currentRole);
  currentRoleRef.current = currentRole;

  const clearSession = useCallback(() => localStorage.removeItem('workdesk-session'), []);

  const stopInactivityTimer = useCallback(() => {
    clearTimeout(inactivityTimer.current);
    clearInterval(inactivityInterval.current);
    setInactivityWarning(false);
    setInactivityPct(100);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    stopInactivityTimer();
    setCurrentRole('');
    setCurrentUser({ name: '', dept: '', adminId: '', perms: {} });
  }, [clearSession, stopInactivityTimer]);

  const startInactivityTimer = useCallback(() => {
    clearTimeout(inactivityTimer.current);
    clearInterval(inactivityInterval.current);
    setInactivityWarning(false);
    setInactivityPct(100);
    let secs = INACTIVITY_MS / 1000;
    setInactivitySeconds(secs);

    inactivityTimer.current = setTimeout(() => {
      setShowSessionModal(true);
    }, INACTIVITY_MS);

    inactivityInterval.current = setInterval(() => {
      secs -= 1;
      setInactivitySeconds(secs);
      setInactivityPct((secs / (INACTIVITY_MS / 1000)) * 100);
      if (secs <= 60) setInactivityWarning(true);
      if (secs <= 0) clearInterval(inactivityInterval.current);
    }, 1000);
  }, [logout]);

  const resetInactivity = useCallback(() => {
    if (!currentRoleRef.current) return;
    startInactivityTimer();
  }, [startInactivityTimer]);

  const continueSession = useCallback(() => {
    setShowSessionModal(false);
    startInactivityTimer();
  }, [startInactivityTimer]);

  useEffect(() => {
    if (!currentRole) return;
    startInactivityTimer();
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'click', 'scroll'];
    events.forEach((ev) => document.addEventListener(ev, resetInactivity, { passive: true }));
    return () => {
      events.forEach((ev) => document.removeEventListener(ev, resetInactivity));
      stopInactivityTimer();
    };
  }, [currentRole]);

  // Session restore now happens in the lazy useState initializers above
  // (synchronously, before first render) — the redundant post-mount
  // useEffect that used to live here was removed because it ran AFTER the
  // first render and couldn't prevent AppLayout from briefly bouncing the
  // user to /login.

  const hasPerm = useCallback(
    (p) => {
      if (currentRole === 'mainadmin') return true;
      if (currentRole === 'admin') return currentUser.perms?.[p] === true;
      return false;
    },
    [currentRole, currentUser]
  );

  // Called by AppContext after employees load to keep perms fresh without re-login.
  // Also promotes staff → admin if permissions are added while they are logged in.
  const refreshPermsFromEmployees = useCallback((employees) => {
    if (currentRole !== 'admin' && currentRole !== 'staff') return;
    const empId = currentUser?.empId;
    if (!empId) return;
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    const permsArray = Array.isArray(emp.perms) ? emp.perms : [];
    const newPermsObj = {};
    permsArray.forEach((p) => { newPermsObj[p] = true; });

    if (currentRole === 'staff' && permsArray.length > 0) {
      // Staff employee just got permissions — promote to admin role live
      const updatedUser = { ...currentUser, perms: newPermsObj, dept: emp.dept };
      setCurrentRole('admin');
      setCurrentUser(updatedUser);
      ls.set('workdesk-session', { role: 'admin', user: updatedUser });
      return;
    }

    const permsChanged = JSON.stringify(newPermsObj) !== JSON.stringify(currentUser.perms || {});
    const deptChanged = emp.dept !== currentUser.dept;
    if (!permsChanged && !deptChanged) return;

    const updatedUser = { ...currentUser, perms: newPermsObj, dept: emp.dept };
    setCurrentUser(updatedUser);
    ls.set('workdesk-session', { role: currentRole, user: updatedUser });
  }, [currentRole, currentUser]);

  const adminLogin = useCallback(
    (username, password) => {
      if (!username || !password) return { ok: false, error: '❌ Please enter your username and password.' };
      // TODO(security): passwords are compared in plaintext against a hardcoded
      // constant (MAIN_ADMIN_PASS in src/constants/index.js). When migrating to
      // Supabase Auth, replace this with a server-side bcrypt/argon2 check
      // and stop shipping the master password in the bundle.
      if (
        username.toUpperCase() === MAIN_ADMIN_USER.toUpperCase() &&
        (timingSafeEqual(password, MAIN_ADMIN_PASS) || timingSafeEqual(password.trim(), MAIN_ADMIN_PASS))
      ) {
        const user = { name: MAIN_ADMIN_USER, dept: 'MAIN ADMIN', adminId: 'mainadmin', perms: {} };
        setCurrentRole('mainadmin');
        setCurrentUser(user);
        ls.set('workdesk-session', { role: 'mainadmin', user });
        return { ok: true, role: 'mainadmin' };
      }
      return { ok: false };
    },
    []
  );

  const staffLogin = useCallback(
    (nameRaw, password, employees) => {
      if (!nameRaw || !password) return { ok: false, error: '❌ Please enter your username and password.' };
      const nUp = nameRaw.toUpperCase();
      // TODO(security): staff passwords are stored in plaintext in workdesk-employees
      // and compared client-side. Migrate to Supabase Auth + bcrypt for any
      // production deployment. Until then, at least stop leaking match info
      // via timing.
      const emp = employees.find((e) => {
        const nameMatch = e.name === nUp || e.name === nameRaw;
        const usernameMatch = e.username && (e.username === nameRaw || e.username.toLowerCase() === nameRaw.toLowerCase());
        if (!nameMatch && !usernameMatch) return false;
        return timingSafeEqual(password, e.password || '') || timingSafeEqual(password.trim(), e.password || '');
      });
      if (!emp) return { ok: false, error: '❌ Username ya Password galat hai!' };

      const hasPerms = Array.isArray(emp.perms) && emp.perms.length > 0;
      if (hasPerms) {
        // Employee with permissions → admin role
        const permsObj = {};
        emp.perms.forEach((p) => { permsObj[p] = true; });
        const user = { name: emp.name, dept: emp.dept, empId: emp.id, username: emp.username || emp.name, perms: permsObj };
        setCurrentRole('admin');
        setCurrentUser(user);
        ls.set('workdesk-session', { role: 'admin', user });
        return { ok: true, role: 'admin' };
      }

      // Regular staff
      const user = { name: emp.name, dept: emp.dept, empId: emp.id, username: emp.username || emp.name, perms: {} };
      setSavedStaffName(emp.name);
      ls.set('workdesk-saved-staff-name', emp.name);
      setCurrentRole('staff');
      setCurrentUser(user);
      ls.set('workdesk-session', { role: 'staff', user });
      return { ok: true, role: 'staff' };
    },
    []
  );

  return (
    <AuthContext.Provider value={{
      currentRole, currentUser, savedStaffName,
      hasPerm, refreshPermsFromEmployees, adminLogin, staffLogin, logout,
      inactivityPct, inactivityWarning, inactivitySeconds,
      showSessionModal, continueSession,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
