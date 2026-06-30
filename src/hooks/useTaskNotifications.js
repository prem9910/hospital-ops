import { useEffect, useRef, useState, useCallback } from 'react';
import { isTaskDueToday, isAssignedTo, toDay } from '../utils';
import { sendReminderEmail } from '../lib/emailService';

const INTERVAL_MS = 60 * 60 * 1000; // 60 minutes
const START_HOUR = 8;

// ── sessionStorage helpers (per-user, cleared when tab closes) ────────────────
function ssKey(user, suffix) {
  return `workdesk-${user.toLowerCase()}-${suffix}`;
}
function ssGetSet(key) {
  try { return new Set(JSON.parse(sessionStorage.getItem(key) || '[]')); } catch { return new Set(); }
}
function ssSaveSet(key, set) {
  try { sessionStorage.setItem(key, JSON.stringify([...set])); } catch {}
}

// toast types:
//   { id, type: 'assigned',          task,     createdAt }
//   { id, type: 'reminder',          task,     createdAt, subtype: 'regular'|'delegation'|'handover' }
//   { id, type: 'handover_request',  handover, createdAt }
//   { id, type: 'handover_response', handover, createdAt }

export function useTaskNotifications(tasks, handovers, currentUser, currentRole, employees = []) {
  const tasksRef     = useRef(tasks);
  const handoversRef = useRef(handovers);

  // Track whether each effect has done its first-run init this session
  const assignedReady    = useRef(false);
  const requestReady     = useRef(false);
  const activeReady      = useRef(false);
  const responseReady    = useRef(false);

  const [permGranted, setPermGranted] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted'
  );
  const [toasts, setToasts] = useState([]);

  useEffect(() => { tasksRef.current = tasks; },      [tasks]);
  useEffect(() => { handoversRef.current = handovers; }, [handovers]);

  useEffect(() => {
    if (!currentUser || currentRole === 'mainadmin') return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') { setPermGranted(true); return; }
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(r => { if (r === 'granted') setPermGranted(true); });
    }
  }, [currentUser?.name, currentRole]);

  function getMyPendingTagged() {
    const t = tasksRef.current;
    const h = handoversRef.current;
    if (!currentUser) return [];
    const myName = currentUser.name;
    const today  = toDay();

    const activeHovers = h.filter(hv =>
      (hv.toName || '').toUpperCase() === myName.toUpperCase() &&
      hv.status === 'accepted' && hv.dateStart && hv.dateEnd &&
      today >= hv.dateStart && today <= hv.dateEnd
    );
    const hoverTaskIds = new Set(activeHovers.flatMap(hv => hv.taskIds || []));

    return t
      .filter(tk => {
        if (tk.status !== 'pending') return false;
        // Future-dated gate — applies to ALL frequencies (including delegation).
        // A delegation with schedDate=tomorrow must NOT surface in reminders,
        // toast queue, or browser push until that date arrives. Mirrors the
        // same gate MyTasks uses on `ownPending` so the in-app surface and
        // the notification surface stay in lockstep. Without this, an admin
        // scheduling a delegation for next week would trigger reminder
        // emails and toasts for the assignee today — which the user
        // explicitly reported as a bug ("upcoming task ki notification
        // current date pe aa rahi hai").
        if (tk.schedDate && tk.schedDate > today) return false;
        if (isAssignedTo(tk, myName)) {
          if (tk.freq === 'delegation') return true;
          if (isTaskDueToday(tk)) return true;
          // Overdue backstop — task with past/today schedDate still belongs in reminders
          if (tk.schedDate && tk.schedDate <= today) return true;
          return false;
        }
        return hoverTaskIds.has(tk.id) || hoverTaskIds.has(tk.parentTaskId);
      })
      .map(tk => {
        const isHandover   = hoverTaskIds.has(tk.id) || hoverTaskIds.has(tk.parentTaskId);
        const isDelegation = tk.freq === 'delegation';
        return { task: tk, subtype: isHandover ? 'handover' : isDelegation ? 'delegation' : 'regular' };
      });
  }

  // ── Assignment notifications ──────────────────────────────────────────────
  // Shows ONCE per session per task (sessionStorage persists across refreshes).
  // First page load: all current tasks → toast (not yet in sessionStorage).
  // Subsequent refreshes: already in sessionStorage → no toast.
  // Truly new task assigned mid-session: also toasts (not yet in sessionStorage).
  //
  // IMPORTANT: only surface the toast for tasks whose schedDate is today or
  // earlier. A recurring task that an employee just marked done spawns a
  // next-slot child with `schedDate = tomorrow` (for daily), +15d, next
  // month, etc. That child IS a new pending task assigned to the employee
  // by definition, but it's NOT due yet — its "assigned" toast must wait
  // until the scheduled date arrives. processPendingNotifications (in
  // MyTasks.jsx) handles the admin-bell/email/activity-log deferral; this
  // filter mirrors that for the in-app toast so all three surfaces fire
  // together on the actual schedDate.
  useEffect(() => {
    if (!currentUser || currentRole === 'mainadmin') return;
    const myName = currentUser.name;
    const ssKeyAssigned = ssKey(myName, 'assigned');
    const todayStr = toDay();

    // Only consider tasks that are actually due now (schedDate <= today).
    // Tasks with a future schedDate are pending but not actionable yet —
    // they're EXCLUDED from `myTasks` here so no toast fires for them.
    // Their ids are also NOT added to `seen`, which means when the
    // schedDate eventually arrives and the user opens (or refreshes) the
    // app, `fresh` will include the task and the toast will fire on the
    // right day. processPendingNotifications (in MyTasks.jsx) handles the
    // admin-bell / email / activity-log deferral for the same tasks; this
    // filter keeps the in-app "assigned" toast in lockstep with that.
    const isDue = (tk) => {
      if (!tk.schedDate) return true; // backstop: no date = treat as due
      return tk.schedDate <= todayStr;
    };

    const myTasks = tasks.filter(tk =>
      tk.status === 'pending' && isAssignedTo(tk, myName) && isDue(tk)
    );

    if (!assignedReady.current) {
      // First render this session — defer slightly so Supabase data is settled
      assignedReady.current = true;
      const seen = ssGetSet(ssKeyAssigned);
      const fresh = myTasks.filter(tk => !seen.has(tk.id));
      if (fresh.length > 0) {
        const now = Date.now();
        setToasts(prev => [...prev, ...fresh.map((tk, i) => ({
          id: now + i, type: 'assigned', task: tk, createdAt: now,
        }))]);
        fresh.forEach(tk => seen.add(tk.id));
        ssSaveSet(ssKeyAssigned, seen);
      }
      return;
    }

    // Mid-session new assignments
    const seen  = ssGetSet(ssKeyAssigned);
    const fresh = myTasks.filter(tk => !seen.has(tk.id));
    if (fresh.length > 0) {
      const now = Date.now();
      setToasts(prev => [...prev, ...fresh.map((tk, i) => ({
        id: now + i, type: 'assigned', task: tk, createdAt: now,
      }))]);
      fresh.forEach(tk => seen.add(tk.id));
      ssSaveSet(ssKeyAssigned, seen);
    }
  }, [tasks, currentUser?.name, currentRole]);

  // ── Handover REQUEST (pending) → notify toName ────────────────────────────
  useEffect(() => {
    if (!currentUser || currentRole === 'mainadmin') return;
    const myName   = currentUser.name;
    const ssKeyReq = ssKey(myName, 'hv-request');
    const incoming  = handovers.filter(hv =>
      (hv.toName || '').toUpperCase() === myName.toUpperCase() && hv.status === 'pending'
    );

    if (!requestReady.current) {
      requestReady.current = true;
      // First render: mark all existing pending requests as seen (no toast — user already knows)
      const seen = ssGetSet(ssKeyReq);
      incoming.forEach(hv => seen.add(hv.id));
      ssSaveSet(ssKeyReq, seen);
      return;
    }

    const seen  = ssGetSet(ssKeyReq);
    const fresh = incoming.filter(hv => !seen.has(hv.id));
    if (fresh.length > 0) {
      const now = Date.now();
      setToasts(prev => [...prev, ...fresh.map((hv, i) => ({
        id: now + i, type: 'handover_request', handover: hv, createdAt: now,
      }))]);
      fresh.forEach(hv => seen.add(hv.id));
      ssSaveSet(ssKeyReq, seen);
    }
  }, [handovers, currentUser?.name, currentRole]);

  // ── Handover ACCEPTED → notify toName: tasks now assigned to them ─────────
  // Also shows "assigned" toast for the handover tasks (once per session).
  useEffect(() => {
    if (!currentUser || currentRole === 'mainadmin') return;
    const myName    = currentUser.name;
    const ssKeyAct  = ssKey(myName, 'hv-active');
    const ssKeyAsn  = ssKey(myName, 'assigned');
    const today     = toDay();
    const activeHovers = handovers.filter(hv =>
      (hv.toName || '').toUpperCase() === myName.toUpperCase() &&
      hv.status === 'accepted' && hv.dateStart && hv.dateEnd &&
      today >= hv.dateStart && today <= hv.dateEnd
    );

    if (!activeReady.current) {
      activeReady.current = true;
      const seen = ssGetSet(ssKeyAct);
      activeHovers.forEach(hv => seen.add(hv.id));
      ssSaveSet(ssKeyAct, seen);
      return;
    }

    const seen  = ssGetSet(ssKeyAct);
    const fresh = activeHovers.filter(hv => !seen.has(hv.id));
    if (fresh.length > 0) {
      const now         = Date.now();
      const hoverTaskIds = new Set(fresh.flatMap(hv => hv.taskIds || []));
      const hoverTasks   = tasksRef.current.filter(tk =>
        (hoverTaskIds.has(tk.id) || hoverTaskIds.has(tk.parentTaskId)) && tk.status === 'pending'
      );

      // "Assigned" toast for each handover task (once per session)
      const seenAsn   = ssGetSet(ssKeyAsn);
      const freshTasks = hoverTasks.filter(tk => !seenAsn.has(tk.id));
      if (freshTasks.length > 0) {
        setToasts(prev => [...prev, ...freshTasks.map((tk, i) => ({
          id: now + i, type: 'assigned', task: tk, createdAt: now,
        }))]);
        freshTasks.forEach(tk => seenAsn.add(tk.id));
        ssSaveSet(ssKeyAsn, seenAsn);
      }

      fresh.forEach(hv => seen.add(hv.id));
      ssSaveSet(ssKeyAct, seen);
    }
  }, [handovers, currentUser?.name, currentRole]);

  // ── Handover RESPONSE (accepted/rejected) → notify fromName ──────────────
  useEffect(() => {
    if (!currentUser || currentRole === 'mainadmin') return;
    const myName    = currentUser.name;
    const ssKeyResp = ssKey(myName, 'hv-response');
    const decided   = handovers.filter(hv =>
      (hv.fromName || '').toUpperCase() === myName.toUpperCase() &&
      (hv.status === 'accepted' || hv.status === 'rejected')
    );

    if (!responseReady.current) {
      responseReady.current = true;
      const seen = ssGetSet(ssKeyResp);
      decided.forEach(hv => seen.add(hv.id));
      ssSaveSet(ssKeyResp, seen);
      return;
    }

    const seen  = ssGetSet(ssKeyResp);
    const fresh = decided.filter(hv => !seen.has(hv.id));
    if (fresh.length > 0) {
      const now = Date.now();
      setToasts(prev => [...prev, ...fresh.map((hv, i) => ({
        id: now + i, type: 'handover_response', handover: hv, createdAt: now,
      }))]);
      fresh.forEach(hv => seen.add(hv.id));
      ssSaveSet(ssKeyResp, seen);
    }
  }, [handovers, currentUser?.name, currentRole]);

  // ── Reminder notifications (repeating interval) ───────────────────────────
  useEffect(() => {
    if (!currentUser || currentRole === 'mainadmin') return;

    function fireReminders() {
      if (new Date().getHours() < START_HOUR) return;
      const tagged = getMyPendingTagged();
      if (!tagged.length) return;
      const today = toDay();
      const order = { handover: 2, delegation: 1, regular: 0 };
      tagged.sort((a, b) => {
        const urgA = a.task.schedDate && (a.task.schedDate < today || (a.task.schedDate === today && a.task.time));
        const urgB = b.task.schedDate && (b.task.schedDate < today || (b.task.schedDate === today && b.task.time));
        if (urgA !== urgB) return urgA ? 1 : -1;
        return order[a.subtype] - order[b.subtype];
      });
      const ts = Date.now();
      setToasts(prev => [...prev, ...tagged.map(({ task: tk, subtype }, i) => ({
        id: ts + i, type: 'reminder', subtype, task: tk, createdAt: ts,
      }))]);

      // Send reminder emails (not for daily tasks)
      const emp = employees.find(e => e.name.toUpperCase() === currentUser.name.toUpperCase());
      if (emp?.email) {
        tagged.forEach(({ task: tk }) => {
          if (tk.freq === 'daily') return;
          // Defensive future-date guard — getMyPendingTagged already excludes
          // tasks with schedDate > today, but if that ever changes we still
          // don't want to email employees about a task that isn't due yet.
          if (tk.schedDate && tk.schedDate > today) return;
          const isOverdue  = tk.schedDate && tk.schedDate < today;
          const isDueToday = tk.schedDate === today;
          const rType = isOverdue ? 'overdue' : isDueToday ? 'due_today' : 'scheduled';
          sendReminderEmail(tk, emp, rType);
        });
      }
    }

    fireReminders();
    const id = setInterval(fireReminders, INTERVAL_MS);
    return () => clearInterval(id);
  }, [currentUser?.name, currentRole]);

  // ── Browser push notifications ────────────────────────────────────────────
  useEffect(() => {
    if (!permGranted || !currentUser || currentRole === 'mainadmin') return;
    function notify() {
      if (Notification.permission !== 'granted') return;
      if (new Date().getHours() < START_HOUR) return;
      getMyPendingTagged().forEach(({ task: tk }, i) => {
        setTimeout(() => {
          new Notification(`⏳ ${tk.name}`, {
            body: `Department: ${tk.dept || '—'} | Priority: ${tk.priority || 'medium'}`,
            icon: '/favicon.ico',
            tag: 'workdesk-reminder-' + tk.id,
          });
        }, i * 500);
      });
    }
    notify();
    const id = setInterval(notify, INTERVAL_MS);
    return () => clearInterval(id);
  }, [permGranted, currentUser?.name, currentRole]);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => setToasts([]), []);

  return { toasts, dismissToast, dismissAll };
}
