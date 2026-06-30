import { useState, useEffect, useRef } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAuth as useAuthHook } from '../../context/AuthContext';
import { useApp as useAppForSaving } from '../../context/AppContext';
import { useApp } from '../../context/AppContext';
import { isTaskDueToday, isAssignedTo, notifyAdmins, toDay, uid, isEscalatedIssue } from '../../utils';
import { useTaskNotifications } from '../../hooks/useTaskNotifications';

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

const PAGE_TITLES = {
  '/dashboard': 'Dashboard', '/tasks': 'Manage Tasks', '/my-tasks': 'My Tasks',
  '/assign-task': 'Assign Task', '/checklist': 'Department Checklists',
  '/issues': 'Issues / Problems', '/all-issues': 'All Issues',
  '/escalation': 'Escalation Tracker', '/employees': 'Employee List',
  '/handover': 'Staff Handover', '/my-handover': 'Handover Form',
  '/departments': 'Departments', '/delegation': 'Delegation Tracker',
  '/my-delegation': 'My Delegations', '/tracking': 'Live Tracking Dashboard',
  '/activity': 'Activity Log', '/mis': 'MIS Reporting',
  '/trash': 'Trash (Auto-Delete After 1 Year)', '/link-box': '🔗 Link Box',
  '/settings': 'Settings', '/report-issue': 'Report a Problem',
  '/notices': 'Notices',
};

export default function AppLayout() {
  const { currentRole, currentUser, logout, inactivityPct, inactivityWarning, inactivitySeconds, showSessionModal, continueSession } = useAuth();
  const { isSaving, notices, employees, save } = useAppForSaving();
  const { tasks, logAct } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showNotifDrop, setShowNotifDrop] = useState(false);
  const [activeNotice, setActiveNotice] = useState(null);

  if (!currentRole) return <Navigate to="/login" replace />;

  const isMain = currentRole === 'mainadmin';
  // De-duplicate by id — Supabase realtime merges can occasionally surface
  // the same row twice in a render, and the same notice id was being
  // shown twice in the bell dropdown. Use a Set to keep only the first.
  const myUnread = (() => {
    const base = isMain
      ? (notices || []).filter(n => (n.toEmpId === 'MAINADMIN' || n.toName === 'MAIN ADMIN') && !n.isRead)
      : (notices || []).filter(n => n.toEmpId === currentUser?.empId && !n.isRead);
    const seen = new Set();
    const out = [];
    for (const n of base) {
      if (!n.id || seen.has(n.id)) continue;
      seen.add(n.id);
      out.push(n);
    }
    return out;
  })();

  async function openNotice(n) {
    setShowNotifDrop(false);
    setActiveNotice(n);
    // dept_change_approval stays unread until explicitly accepted
    if (!n.isRead && n.type !== 'dept_change_approval') {
      await save('workdesk-notices', (notices || []).map(x => x.id === n.id ? { ...x, isRead: true } : x));
    }
  }

  async function acceptDeptChange(n) {
    if (!n.meta?.newDept || !n.meta?.empId) return;
    const nowStr = new Date().toISOString();
    const todayStr = toDay();
    // Cancel all upcoming tasks (schedDate > today, status pending) assigned
    // to this employee. The user's reasoning: after a dept change new tasks
    // will be assigned in the new department, so the old upcoming queue is
    // obsolete. We mark them with status='cancelled' (not deleted) so:
    //   1. They DON'T appear in Upcoming or Ongoing (terminal-status guard
    //      in Tasks.jsx excludes them).
    //   2. They DO appear in the Done tab with the 🚫 CANCELLED badge so
    //      the user has an audit trail of what was cancelled and why.
    //   3. The activity log records the cancellation for history.
    //
    // For tasks assigned to MULTIPLE people we keep the task pending but
    // remove this employee from `assignedTo` so the task stays valid for
    // the other assignees. For tasks assigned to only this employee we
    // cancel the row.
    //
    // CHILD TASKS: child rows (parentTaskId !== '') inherit the parent's
    // assignedTo at creation time (see autoCycleTasks / handleDone). They
    // are not matched by the upcoming filter above because their schedDate
    // is typically later than today, BUT once the parent is cancelled the
    // child becomes an orphan still assigned to the employee — and still
    // shows in the Upcoming tab. So we cascade: for every parent in
    // upcomingTasks we also process its children with the SAME fate:
    //   - parent cancelled (single-assignee)         → cancel ALL its children
    //   - parent kept with stripped assignedTo       → strip this employee
    //                                                   from every child
    // This catches children regardless of their own schedDate so the new
    // department starts with a clean queue.
    const seedUpcoming = (tasks || []).filter(t =>
      t.status === 'pending' &&
      t.schedDate &&
      t.schedDate > todayStr &&
      isAssignedTo(t, n.toName)
    );
    // Parent ids whose assignment is being cleared for this employee.
    const clearedParentIds = new Set(seedUpcoming.filter(t => !t.parentTaskId).map(t => t.id));
    // Cascade: any child whose parent is in clearedParentIds — match by
    // schedDate too if the child itself is upcoming, OR include all children
    // of a cleared parent (regardless of schedDate) because the parent is
    // leaving this employee's queue and the child has no business staying
    // assigned to them in any state.
    const cascadeChildren = (tasks || []).filter(t =>
      t.status === 'pending' &&
      t.parentTaskId &&
      clearedParentIds.has(t.parentTaskId) &&
      isAssignedTo(t, n.toName)
    );
    const upcomingTasks = [...seedUpcoming, ...cascadeChildren];
    const cancelledTaskIds = [];
    const unassignedOnlyIds = [];
    const cancelledChildIds = [];
    const unassignedOnlyChildIds = [];
    let updatedTasks = tasks || [];
    if (upcomingTasks.length > 0) {
      const cancelReason = `Cancelled — department change from "${n.meta.oldDept}" to "${n.meta.newDept}" accepted by ${n.toName}`;
      updatedTasks = updatedTasks
        .map((t) => {
          if (!upcomingTasks.find((u) => u.id === t.id)) return t;
          const others = (t.assignedTo || []).filter((name) => (name || '').toUpperCase() !== n.toName.toUpperCase());
          if (others.length === 0) {
            // Only this employee assigned — mark the row cancelled so it
            // surfaces in the Done tab with the 🚫 CANCELLED badge. The row
            // is preserved (not deleted) so the cancellation has an audit
            // trail in the Done tab and the activity log.
            if (t.parentTaskId) cancelledChildIds.push(t.id);
            else cancelledTaskIds.push(t.id);
            return {
              ...t,
              status: 'cancelled',
              cancelReason,
              cancelledAt: nowStr,
              cancelledBy: n.toName,
            };
          }
          // Other assignees remain — just strip this employee from the list.
          // The task stays pending for the remaining assignees.
          if (t.parentTaskId) unassignedOnlyChildIds.push(t.id);
          else unassignedOnlyIds.push(t.id);
          return { ...t, assignedTo: others };
        });
      await save('workdesk-tasks', updatedTasks);
      const parentSummary = `${cancelledTaskIds.length} parent(s) cancelled, ${unassignedOnlyIds.length} parent(s) unassigned-only`;
      const childSummary = `${cancelledChildIds.length} child(ren) cancelled, ${unassignedOnlyChildIds.length} child(ren) unassigned-only`;
      const summary = `${n.toName} on dept change to "${n.meta.newDept}": ${parentSummary}; ${childSummary}`;
      await logAct('UPCOMING TASKS CANCELLED — DEPT CHANGE',
        `${summary} (IDs: ${[...cancelledTaskIds, ...unassignedOnlyIds, ...cancelledChildIds, ...unassignedOnlyChildIds].slice(0, 5).map((id) => id.slice(-6)).join(', ')}${cancelledTaskIds.length + unassignedOnlyIds.length + cancelledChildIds.length + unassignedOnlyChildIds.length > 5 ? '…' : ''})`
      );
    }
    const clearedTaskIds = [...cancelledTaskIds, ...unassignedOnlyIds, ...cancelledChildIds, ...unassignedOnlyChildIds];
    // Apply dept change + clear pendingDept
    const updatedEmps = (employees || []).map(e =>
      e.id === n.meta.empId ? { ...e, dept: n.meta.newDept, pendingDept: '' } : e
    );
    await save('workdesk-employees', updatedEmps);
    // Mark approval notice as read AND record acceptance in meta
    const updatedNotices = (notices || []).map(x =>
      x.id === n.id ? { ...x, isRead: true, meta: { ...x.meta, accepted: true, acceptedAt: nowStr, clearedTaskIds } } : x
    );
    // Confirmation notice (to employee)
    const confirmNotice = {
      id: uid(), toEmpId: n.toEmpId, toName: n.toName,
      fromName: 'MAIN ADMIN',
      subject: 'DEPARTMENT CHANGED SUCCESSFULLY',
      message: `Dear ${n.toName},\n\nYour department has been changed from "${n.meta.oldDept}" to "${n.meta.newDept}".\n\n${cancelledTaskIds.length + cancelledChildIds.length > 0 ? `${cancelledTaskIds.length + cancelledChildIds.length} upcoming task(s) previously assigned to you have been cancelled automatically. You can view them in the Done tab. Your new department will assign fresh tasks as needed.\n\n` : ''}Please report to your new department at the earliest.\n\nRegards,\nMAIN ADMIN`,
      type: 'general', isRead: false, sentAt: nowStr, meta: null,
    };
    // Admin bell alert — employee accepted the dept change
    const adminAlert = {
      id: uid(), toEmpId: 'MAINADMIN', toName: 'MAIN ADMIN',
      fromName: n.toName,
      subject: `✅ ${n.toName} accepted dept change`,
      message: `${n.toName} has accepted the department change from "${n.meta.oldDept}" to "${n.meta.newDept}".${clearedTaskIds.length > 0 ? ` ${cancelledTaskIds.length + cancelledChildIds.length} upcoming task(s) cancelled.` : ''}`,
      type: 'dept_change_accepted', isRead: false, sentAt: nowStr,
      meta: { empId: n.meta.empId, newDept: n.meta.newDept, oldDept: n.meta.oldDept, clearedTaskIds },
    };
    await save('workdesk-notices', [...updatedNotices, confirmNotice, adminAlert]);
    setActiveNotice(null);
  }

  async function rejectDeptChange(n) {
    if (!n.meta?.empId) return;
    const nowStr = new Date().toISOString();
    // Clear pendingDept — employee stays in their current dept.
    // Upcoming tasks are NOT touched; they continue normally as if no
    // dept change was ever proposed.
    const updatedEmps = (employees || []).map(e =>
      e.id === n.meta.empId ? { ...e, pendingDept: '' } : e
    );
    await save('workdesk-employees', updatedEmps);
    // Mark approval notice as read AND record rejection in meta
    const updatedNotices = (notices || []).map(x =>
      x.id === n.id ? { ...x, isRead: true, meta: { ...x.meta, rejected: true, rejectedAt: nowStr } } : x
    );
    // Confirmation notice (to employee)
    const confirmNotice = {
      id: uid(), toEmpId: n.toEmpId, toName: n.toName,
      fromName: 'MAIN ADMIN',
      subject: 'DEPARTMENT CHANGE DECLINED',
      message: `Dear ${n.toName},\n\nYou have declined the department change from "${n.meta.oldDept}" to "${n.meta.newDept}".\n\nYou will continue to remain in your current department "${n.meta.oldDept || ''}".\n\nAny upcoming tasks assigned to you will continue as scheduled.\n\nRegards,\nMAIN ADMIN`,
      type: 'general', isRead: false, sentAt: nowStr, meta: null,
    };
    // Admin bell alert — employee rejected the dept change
    const adminAlert = {
      id: uid(), toEmpId: 'MAINADMIN', toName: 'MAIN ADMIN',
      fromName: n.toName,
      subject: `❌ ${n.toName} rejected dept change`,
      message: `${n.toName} has rejected the department change from "${n.meta.oldDept}" to "${n.meta.newDept}". They remain in "${n.meta.oldDept || '—'}".`,
      type: 'dept_change_rejected', isRead: false, sentAt: nowStr,
      meta: { empId: n.meta.empId, newDept: n.meta.newDept, oldDept: n.meta.oldDept },
    };
    await save('workdesk-notices', [...updatedNotices, confirmNotice, adminAlert]);
    await logAct('DEPT CHANGE REJECTED', `${n.toName} declined change from "${n.meta.oldDept || '—'}" to "${n.meta.newDept}" — staying in current dept`);
    setActiveNotice(null);
  }

  function fDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
  }

  const pageTitle = PAGE_TITLES[location.pathname] || 'Work Desk';

  return (
    <>
    <style>{`
      @keyframes hopsSave {
        0%   { left: -40%; }
        100% { left: 120%; }
      }
      .hops-save-bar { position: fixed; top: 55px; left: 0; right: 0; height: 2px; z-index: 9998; background: #e4eaf2; overflow: hidden; }
      .hops-save-bar::after { content: ''; position: absolute; height: 100%; width: 40%; background: linear-gradient(90deg, transparent, #0d7377, #14a5ab, transparent); animation: hopsSave 0.9s ease infinite; }
    `}</style>
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#eef2f7', fontFamily: "'Nunito',sans-serif" }}>
      <SidebarMenu
        currentPath={location.pathname}
        onNavigate={(path) => { navigate(path); setMobileOpen(false); }}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        currentRole={currentRole}
        currentUser={currentUser}
        logout={logout}
      />

      {mobileOpen && <div onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 90 }} />}

      <div className="hops-main" style={{ flex: 1, marginLeft: 230, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="hops-topbar" style={{ height: 56, background: 'white', borderBottom: '1px solid #d8e2ef', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setMobileOpen((s) => !s)} className="hops-hamburger" style={{ flexDirection: 'column', gap: 4, cursor: 'pointer', padding: 4, border: 'none', background: 'none' }}>
              <span style={{ width: 19, height: 2, background: '#0b1e3d', borderRadius: 2, display: 'block' }} />
              <span style={{ width: 19, height: 2, background: '#0b1e3d', borderRadius: 2, display: 'block' }} />
              <span style={{ width: 19, height: 2, background: '#0b1e3d', borderRadius: 2, display: 'block' }} />
            </button>
            <div className="hops-topbar-title" style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, color: '#0b1e3d', fontWeight: 700 }}>{pageTitle}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isSaving && (
              <div className="hops-topbar-saving" style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 7, padding: '4px 10px' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#0d7377', animation: 'pulse 1s ease infinite' }} />
                <span style={{ fontSize: 11, color: '#0d7377', fontWeight: 800 }}>Saving...</span>
              </div>
            )}

            {/* Notice bell — visible for all roles including mainadmin */}
            <div style={{ position: 'relative' }}>
                <button onClick={() => setShowNotifDrop(s => !s)}
                  style={{ position: 'relative', height: 36, borderRadius: 9, border: '1px solid #d8e2ef', background: myUnread.length > 0 ? '#fff7ed' : '#f3f7fc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px', fontSize: 17 }}>
                  <span style={{ fontSize: 13, lineHeight: 1 }}>🔔</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: myUnread.length > 0 ? '#c2410c' : '#6b7a90' }}>Notice</span>
                  {myUnread.length > 0 && (
                    <span style={{ position: 'absolute', top: -5, right: -5, background: '#ef4444', color: 'white', fontSize: 9, fontWeight: 800, borderRadius: 20, padding: '1px 5px', minWidth: 16, textAlign: 'center', border: '2px solid white' }}>
                      {myUnread.length}
                    </span>
                  )}
                </button>

                {showNotifDrop && (
                  <>
                    <div onClick={() => setShowNotifDrop(false)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
                    <div className="hops-notice-dropdown" style={{ position: 'absolute', top: 44, right: 0, background: 'white', borderRadius: 12, border: '1px solid #e0e8f0', boxShadow: '0 8px 32px rgba(11,30,61,0.14)', zIndex: 999, overflow: 'hidden' }}>
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f4f8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, fontWeight: 700, color: '#0b1e3d' }}>📬 Notices</span>
                        <span style={{ fontSize: 11, color: '#6b7a90', fontWeight: 600 }}>{myUnread.length} unread</span>
                      </div>
                      {myUnread.length > 0 ? (
                        <>
                          <div style={{ padding: '8px 14px', background: '#fff7ed', borderBottom: '1px solid #f0f4f8', fontSize: 11, fontWeight: 800, color: '#c2410c' }}>
                            {myUnread.length} unread notice{myUnread.length > 1 ? 's' : ''}
                          </div>
                          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                            {myUnread.map((n, i) => (
                              <button key={n.id} onClick={() => openNotice(n)}
                                style={{ width: '100%', textAlign: 'left', padding: '11px 16px', border: 'none', borderBottom: i < myUnread.length - 1 ? '1px solid #f0f4f8' : 'none', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f0f7ff'}
                                onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                  <span style={{ fontSize: 18, flexShrink: 0 }}>{n.type === 'task_reminder' ? '⏰' : n.type === 'dept_change_approval' ? '🏢' : '📋'}</span>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: '#0b1e3d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 190 }}>{n.subject}</div>
                                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>From: {n.fromName} · {fDate(n.sentAt)}</div>
                                  </div>
                                </div>
                                <span style={{ fontSize: 9, fontWeight: 800, color: '#1d4ed8', background: '#dbeafe', padding: '2px 7px', borderRadius: 20, flexShrink: 0 }}>NEW</span>
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                          <div style={{ fontSize: 32, marginBottom: 8 }}>🔔</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#6b7a90', marginBottom: 4 }}>No new notices</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 14 }}>All caught up!</div>
                          <button onClick={() => { setShowNotifDrop(false); navigate('/notices'); }}
                            style={{ width: '100%', padding: '9px', borderRadius: 8, background: '#f0f7ff', color: '#0d7377', border: '1px solid #cce0f0', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
                            📋 Notice History
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

            <div className="hops-topbar-date" style={{ fontSize: 12, color: '#6b7a90', fontWeight: 600, background: '#f3f7fc', padding: '5px 10px', borderRadius: 7, border: '1px solid #d8e2ef' }}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}
            </div>
          </div>
        </div>

        {/* Notice detail modal */}
        {activeNotice && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: 'white', borderRadius: 16, maxWidth: 460, width: '100%', boxShadow: '0 16px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
              <div style={{ background: 'linear-gradient(135deg,#0d7377,#0b5e62)', padding: '18px 22px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.65)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                    {activeNotice.type === 'task_reminder' ? '⏰ Task Reminder' : activeNotice.type === 'dept_change_approval' ? '🏢 Department Change' : '📋 Notice'} · From: {activeNotice.fromName}
                  </div>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: 'white', fontWeight: 700 }}>{activeNotice.subject}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>{fDate(activeNotice.sentAt)}</div>
                </div>
                <button onClick={() => setActiveNotice(null)}
                  style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'rgba(255,255,255,0.15)', color: 'white', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
              </div>
              <div style={{ padding: '20px 22px' }}>
                <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{activeNotice.message}</div>
                {activeNotice.type === 'dept_change_approval' ? (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f0f4f8', display: 'flex', gap: 8 }}>
                    <button onClick={() => acceptDeptChange(activeNotice)}
                      style={{ flex: 1, padding: '9px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
                      ✅ Accept
                    </button>
                    <button onClick={() => {
                      if (window.confirm('Reject this department change?\n\nYou will continue to remain in your current department and all your upcoming tasks will continue normally.')) {
                        rejectDeptChange(activeNotice);
                      }
                    }}
                      style={{ flex: 1, padding: '9px', borderRadius: 8, background: 'transparent', color: '#c0392b', border: '1.5px solid #c0392b', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
                      ❌ Reject
                    </button>
                    <button onClick={() => setActiveNotice(null)}
                      style={{ flex: 1, padding: '9px', borderRadius: 8, background: 'transparent', color: '#d4920a', border: '1.5px solid #d4920a', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
                      🔔 Later
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f0f4f8', display: 'flex', gap: 8 }}>
                    <button onClick={() => setActiveNotice(null)}
                      style={{ flex: 1, padding: '9px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
                      ✓ Got It
                    </button>
                    <button onClick={() => { setActiveNotice(null); navigate('/notices'); }}
                      style={{ flex: 1, padding: '9px', borderRadius: 8, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
                      📋 View History
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {isSaving && <div className="hops-save-bar" />}

        <main className="hops-main-pad" style={{ flex: 1, overflowY: 'auto' }}>
          <Outlet />
        </main>
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 3, zIndex: 9999, pointerEvents: 'none' }}>
        <div style={{
          height: '100%', width: `${inactivityPct}%`, transition: 'width 1s linear, background 1s',
          background: inactivityPct < 20 ? 'linear-gradient(90deg,#c0392b,#ff6b6b)' : inactivityPct < 40 ? 'linear-gradient(90deg,#d4920a,#f5c842)' : 'linear-gradient(90deg,#0d7377,#27ae60)',
        }} />
      </div>
      {inactivityWarning && !showSessionModal && (
        <div style={{ position: 'fixed', bottom: 14, right: 14, background: '#1a2535', color: 'white', padding: '10px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', borderLeft: '3px solid #d4920a' }}>
          ⏰ Session expires in {inactivitySeconds} seconds — please click something!
        </div>
      )}

      {showSessionModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 16, padding: '32px 28px', maxWidth: 380, width: '90%', boxShadow: '0 12px 50px rgba(0,0,0,0.3)', textAlign: 'center' }}>
            <div style={{ fontSize: 42, marginBottom: 12 }}>⏰</div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, color: '#0b1e3d', marginBottom: 8, fontWeight: 700 }}>Session Expired</div>
            <div style={{ fontSize: 13, color: '#6b7a90', marginBottom: 24, lineHeight: 1.6 }}>
              No activity detected for 5 minutes.<br />
              Would you like to <strong style={{ color: '#0d7377' }}>continue</strong><br />or <strong style={{ color: '#c0392b' }}>log out</strong>?
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={continueSession} style={{ padding: '10px 26px', borderRadius: 9, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 14, boxShadow: '0 2px 8px rgba(13,115,119,0.3)' }}>✅ Continue</button>
              <button onClick={logout} style={{ padding: '10px 26px', borderRadius: 9, background: 'transparent', color: '#c0392b', border: '2px solid #c0392b', cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>⬅ Logout</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

function SidebarMenu({ currentPath, onNavigate, mobileOpen, onMobileClose, currentRole, currentUser, logout }) {
  const { tasks, issues, handovers, delegations, employees, depts, notices, isSaving } = useApp();
  const { hasPerm } = useAuthHook();
  const { toasts, dismissToast, dismissAll } = useTaskNotifications(tasks, handovers, currentUser, currentRole, employees);
  const isDark = useDarkTheme();
  const listRef = useRef(null);
  const prevToastLen = useRef(0);
  const [exitingIds, setExitingIds] = useState(new Set());

  function clearAllAnimated() {
    const STEP = 80;
    toasts.forEach((t, i) => {
      setTimeout(() => {
        setExitingIds(prev => new Set([...prev, t.id]));
      }, i * STEP);
    });
    // Last notification finishes at (length-1)*STEP + 300ms slide-out
    setTimeout(() => {
      dismissAll();
      setExitingIds(new Set());
    }, (toasts.length - 1) * STEP + 300);
  }

  // Smoothly scroll to bottom BEFORE new toasts' slide-in begins
  useEffect(() => {
    if (!listRef.current) return;
    if (toasts.length > prevToastLen.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }
    prevToastLen.current = toasts.length;
  }, [toasts.length]);

  const isMain = currentRole === 'mainadmin';
  const isAdmin = currentRole === 'admin';
  const isStaff = currentRole === 'staff';

  // Always scope to the current user's tasks for the "Manage Tasks" badge so
  // it matches what Tasks.jsx actually shows. Main admin gets the full list;
  // everyone else sees only tasks they're assigned to or created.
  const myTasksBase = isMain
    ? tasks
    : tasks.filter((t) => isAssignedTo(t, currentUser.name) || t.createdBy === currentUser.name);

  // Sidebar badges count CURRENT-DATE pending tasks only — i.e. tasks the
  // user can actually act on right now. Future-dated pending tasks are
  // excluded so the badge answers "how many do I still need to do today?"
  // not "how many are scheduled in total?". Missing schedDate is treated as
  // due today (backstop for legacy rows created before the form had a date
  // default). Done tasks are excluded — they live in the Done tab.
  const isCurrentDatePending = (t) => {
    if (t.status !== 'pending') return false;
    if (!t.schedDate) return true;                       // backstop
    return t.schedDate <= toDay();
  };

  const badges = {
    tasks: myTasksBase.filter(isCurrentDatePending).length,
    myTasks: (() => {
      const myName = currentUser.name;
      const today = toDay();
      const activeHovers = handovers.filter(h =>
        (h.toName || '').toUpperCase() === myName.toUpperCase() &&
        h.status === 'accepted' && h.dateStart && h.dateEnd &&
        today >= h.dateStart && today <= h.dateEnd
      );
      const hoverTaskIds = new Set(activeHovers.flatMap(h => h.taskIds || []));
      const tById = {};
      tasks.forEach(t => { tById[t.id] = t; });
      // Own pending — exclude grandchild bug artifacts, deduplicate parent/child.
      // Gate on schedDate <= today so future-dated daily tasks don't leak in
      // via isTaskDueToday() (which returns true for daily unconditionally).
      const ownCount = tasks.filter(t => {
        if (!isAssignedTo(t, myName) || t.status !== 'pending') return false;
        // Skip grandchild tasks (parent also has parentTaskId)
        if (t.parentTaskId && tById[t.parentTaskId]?.parentTaskId) return false;
        // Skip parent if a pending child exists for me
        if (tasks.some(x => x.parentTaskId === t.id && x.status === 'pending' && isAssignedTo(x, myName))) return false;
        // schedDate gate: future-dated tasks don't count here. Missing date
        // counts as due today (backstop for legacy rows).
        if (t.schedDate && t.schedDate > today) return false;
        return true;
      }).length;
      // Handover received — only original task IDs (not children)
      const handoverRealCount = tasks.filter(t =>
        hoverTaskIds.has(t.id) && t.status === 'pending' && !isAssignedTo(t, myName)
      ).length;
      // Handover received — daily done tasks needing repeat today (virtual pending)
      const handoverVirtualCount = tasks.filter(t =>
        hoverTaskIds.has(t.id) && t.status === 'done' && t.freq === 'daily' &&
        t.lastDone < today &&
        !tasks.some(x => x.parentTaskId === t.id && x.status === 'pending')
      ).length;
      return ownCount + handoverRealCount + handoverVirtualCount;
    })(),
    issues: issues.filter((i) => i.status !== 'resolved').length,
    escalation: issues.filter(isEscalatedIssue).length,
    handover: handovers.filter((h) => { const t = toDay(); return h.dateStart ? (t >= h.dateStart && t <= h.dateEnd) : h.status === 'pending'; }).length,
    delegation: delegations.filter((d) => d.status === 'pending' || d.status === 'accepted').length,
    delegationTasks: tasks.filter((t) => t.freq === 'delegation' && t.status === 'pending').length,
    myDelegation: delegations.filter((d) => d.doerName === currentUser.name && (d.status === 'pending' || d.status === 'accepted')).length,
    checklist: tasks.filter((t) => isTaskDueToday(t) && t.status === 'pending').length,
    employees: employees.length,
    depts: depts.length,
    notices: (notices || []).filter(n => {
      if (n.isRead) return false;
      if (isMain) return n.toEmpId === 'MAINADMIN' || n.toName === 'MAIN ADMIN';
      return n.toEmpId === currentUser?.empId;
    }).length,
  };

  const chipLabel = isMain ? '👑 MAIN ADMIN' : isAdmin ? '👨‍💼 ADMIN' : '👷 STAFF';
  const chipStyle = isDark
    ? isMain ? { background: 'rgba(245,200,66,0.2)', color: '#f5c842', border: '1px solid rgba(245,200,66,0.35)' }
      : isAdmin ? { background: 'rgba(20,165,171,0.2)', color: '#5eead4', border: '1px solid rgba(20,165,171,0.3)' }
      : { background: 'rgba(29,185,84,0.15)', color: '#4ade80', border: '1px solid rgba(29,185,84,0.3)' }
    : isMain ? { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }
    : isAdmin ? { background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }
    : { background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' };
  const avStyle = isDark
    ? isMain ? { background: 'rgba(245,200,66,0.25)', color: '#f5c842' } : isAdmin ? { background: 'rgba(20,165,171,0.25)', color: '#5eead4' } : { background: 'rgba(29,185,84,0.2)', color: '#4ade80' }
    : isMain ? { background: '#fef3c7', color: '#92400e' } : isAdmin ? { background: '#e0f2fe', color: '#0369a1' } : { background: '#dcfce7', color: '#166534' };

  const navBg = isDark ? '#0b1e3d' : '#ffffff';
  const navBorder = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';
  const navShadow = isDark ? '3px 0 20px rgba(0,0,0,0.35)' : '2px 0 12px rgba(0,0,0,0.06)';
  const brandColor = isDark ? '#f5c842' : '#0b1e3d';
  const groupColor = isDark ? 'rgba(255,255,255,0.3)' : '#94a3b8';
  const itemInactiveColor = isDark ? 'rgba(255,255,255,0.6)' : '#475569';
  const itemHoverBg = isDark ? 'rgba(255,255,255,0.07)' : '#f1f5f9';
  const itemHoverColor = isDark ? 'white' : '#0b1e3d';
  const footerBg = isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc';
  const footerNameColor = isDark ? 'white' : '#0b1e3d';
  const footerDeptColor = isDark ? 'rgba(255,255,255,0.35)' : '#94a3b8';
  const logoutColor = isDark ? 'rgba(255,255,255,0.35)' : '#94a3b8';
  const logoutBorder = isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0';

  function NavItem({ id, label, icon, badge, perm }) {
    if (perm && !hasPerm(perm)) return null;
    const path = '/' + id;
    const active = currentPath === path;
    const cnt = badge ? badges[badge] || 0 : 0;
    return (
      <button
        onClick={() => onNavigate(path)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
          borderRadius: 8, cursor: 'pointer', border: 'none', textAlign: 'left', fontSize: 13, fontWeight: 600,
          marginBottom: 1, transition: 'all 0.15s', position: 'relative',
          background: active ? '#0d7377' : 'transparent',
          color: active ? 'white' : itemInactiveColor,
          boxShadow: active ? 'inset 3px 0 0 #14a5ab' : 'none',
          fontFamily: "'Nunito',sans-serif",
        }}
        onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = itemHoverBg; e.currentTarget.style.color = itemHoverColor; } }}
        onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = itemInactiveColor; } }}
      >
        <span>{icon}</span>
        <span style={{ flex: 1 }}>{label}</span>
        {cnt > 0 && (
          <span style={{ background: '#ef4444', color: 'white', borderRadius: 20, fontSize: 10, fontWeight: 800, padding: '1px 7px', minWidth: 18, textAlign: 'center' }}>
            {cnt}
          </span>
        )}
      </button>
    );
  }

  function Group({ label }) {
    return <div style={{ fontSize: 9, letterSpacing: '1.8px', color: groupColor, padding: '12px 8px 4px', textTransform: 'uppercase', fontWeight: 800 }}>{label}</div>;
  }

  return (
    <>
      <nav className={`hops-sidebar${mobileOpen ? ' mob-open' : ''}`} style={{
        width: 230, background: navBg, color: isDark ? 'white' : '#1e293b', display: 'flex', flexDirection: 'column',
        position: 'fixed', height: '100vh', zIndex: 100,
        borderRight: `1px solid ${navBorder}`,
        boxShadow: navShadow,
        transition: 'background 0.3s, transform 0.3s',
      }}>
        <div style={{ padding: '16px', borderBottom: `1px solid ${navBorder}` }}>
          <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, color: brandColor, lineHeight: 1.3, marginBottom: 6 }}>🗂️ Work Desk</h1>
          <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 10, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase', ...chipStyle }}>
            {chipLabel}
          </span>
        </div>

        <div style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
          <Group label="OVERVIEW" />
          <NavItem id="dashboard" label="Dashboard" icon="📊" />

          {(isMain || isAdmin) && <>
            {!isMain && <>
              <Group label="MY WORK" />
              <NavItem id="my-tasks" label="My Tasks" icon="📋" badge="myTasks" />
              <NavItem id="my-handover" label="Incoming Handovers" icon="📥" />
            </>}

            <Group label="TASKS & CHECKLISTS" />
            {(isMain || hasPerm('tasks_view')) && <NavItem id="tasks" label="Manage Tasks" icon="✅" badge="tasks" />}
            {(isMain || hasPerm('checklist_view')) && <NavItem id="checklist" label="Checklists" icon="📋" badge="checklist" />}
            <Group label="ISSUES" />
            {(isMain || hasPerm('issues_view')) && <NavItem id="issues" label="Issues" icon="⚠️" badge="issues" />}
            {(isMain || hasPerm('escalation_view')) && <NavItem id="escalation" label="Escalation" icon="🔺" badge="escalation" />}
            <Group label="STAFF & DEPTS" />
            {(isMain || hasPerm('employees_view')) && <NavItem id="employees" label="Employees" icon="👥" badge="employees" />}
            {(isMain || hasPerm('handover_view')) && <NavItem id="handover" label="Handover Register" icon="📋" badge="handover" />}
            {(isMain || hasPerm('departments_view')) && <NavItem id="departments" label="Departments" icon="🏢" badge="depts" />}
            {(isMain || hasPerm('tracking_view')) && <NavItem id="tracking" label="Live Tracking" icon="📈" />}
            <Group label="DELEGATION" />
            {(isMain || hasPerm('delegation_view')) && <NavItem id="delegation-tasks" label="Delegation Tasks" icon="📋" badge="delegationTasks" />}
            {isMain && <>
              <Group label="MAIN ADMIN" />
              <NavItem id="notices" label="Notices" icon="📨" />
              <NavItem id="activity" label="Activity Log" icon="📜" />
              <NavItem id="mis" label="MIS Reporting" icon="📑" />
            </>}
            {isAdmin && hasPerm('mis_view') && <>
              <Group label="REPORTS" />
              <NavItem id="mis" label="MIS Reporting" icon="📑" perm="mis_view" />
            </>}
            <Group label="SYSTEM" />
            {(isMain || hasPerm('trash_view')) && <NavItem id="trash" label="Trash" icon="🗑️" />}
            <NavItem id="link-box" label="Link Box" icon="🔗" />
            <NavItem id="settings" label="Settings" icon="⚙️" />
          </>}

          {isStaff && <>
            <Group label="MY WORK" />
            <NavItem id="my-tasks" label="My Tasks" icon="✅" badge="myTasks" />
            <NavItem id="assign-task" label="Assign Task" icon="📋" />
            <NavItem id="my-handover" label="Incoming Handovers" icon="📥" />
            <NavItem id="my-delegation" label="My Delegations" icon="📤" badge="myDelegation" />
            <NavItem id="mis" label="My MIS Report" icon="📑" />
            <Group label="REPORT" />
            <NavItem id="report-issue" label="Report Problem" icon="⚠️" />
            <NavItem id="all-issues" label="All Issues" icon="📋" badge="issues" />
            {hasPerm('handover_view') && <NavItem id="handover" label="Handover Register" icon="🔄" badge="handover" />}
            <Group label="TOOLS" />
            <NavItem id="link-box" label="Link Box" icon="🔗" />
            <NavItem id="settings" label="Settings" icon="⚙️" />
          </>}
        </div>

        <div style={{ padding: '12px', borderTop: `1px solid ${navBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 9px', borderRadius: 8, background: footerBg }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0, ...avStyle }}>
              {currentUser.name?.charAt(0) || 'A'}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: footerNameColor }}>{currentUser.name}</div>
              <div style={{ fontSize: 10, color: footerDeptColor }}>{currentUser.dept || 'Administrator'}</div>
            </div>
          </div>
          <button onClick={logout}
            style={{ width: '100%', marginTop: 6, padding: '7px', borderRadius: 7, border: `1px solid ${logoutBorder}`, background: 'transparent', color: logoutColor, fontFamily: "'Nunito',sans-serif", fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.07)' : '#fef2f2'; e.currentTarget.style.color = isDark ? 'white' : '#ef4444'; e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.2)' : '#fecaca'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = logoutColor; e.currentTarget.style.borderColor = logoutBorder; }}>
            ⬅ Logout
          </button>
        </div>
      </nav>

      {/* Toast stack — above theme toggle */}
      {toasts.length > 0 && (
        <div className="hops-toast-stack" style={{ position: 'fixed', bottom: 72, right: 24, zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 0, alignItems: 'flex-end', maxHeight: 'calc(100vh - 130px)', background: 'transparent' }}>
          {/* Scrollable list */}
          <div ref={listRef} className="hops-toast-list" style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', scrollBehavior: 'smooth', background: 'transparent' }}>
            {toasts.map((t, i) => {
              // Newest items at end of array → lowest stagger → appear first
              const newBatchStart = Math.max(0, toasts.length - prevToastLen.current);
              const posInBatch = i - (toasts.length - newBatchStart);
              const stagger = posInBatch >= 0 ? posInBatch * 100 : 0;
              const exiting = exitingIds.has(t.id);
              if (t.type === 'assigned')
                return <AssignedToast key={t.id} task={t.task} createdAt={t.createdAt} onDismiss={() => dismissToast(t.id)} isDark={isDark} index={stagger} exiting={exiting} />;
              if (t.type === 'handover_request')
                return <HandoverRequestToast key={t.id} handover={t.handover} createdAt={t.createdAt} onDismiss={() => dismissToast(t.id)} isDark={isDark} index={stagger} exiting={exiting} />;
              if (t.type === 'handover_response')
                return <HandoverResponseToast key={t.id} handover={t.handover} createdAt={t.createdAt} onDismiss={() => dismissToast(t.id)} isDark={isDark} index={stagger} exiting={exiting} />;
              return <ReminderToast key={t.id} task={t.task} subtype={t.subtype} createdAt={t.createdAt} onDismiss={() => dismissToast(t.id)} isDark={isDark} index={stagger} exiting={exiting} />;
            })}
          </div>
          {/* Fixed Clear All — disappears as soon as last notification exits */}
          {toasts.length > 1 && (
            <button onClick={clearAllAnimated} className="hops-toast-clear" style={{
              padding: '9px 0', borderRadius: 10, flexShrink: 0,
              marginTop: 8,
              background: isDark ? 'rgba(239,68,68,0.15)' : '#fef2f2',
              border: `1px solid ${isDark ? 'rgba(239,68,68,0.3)' : '#fecaca'}`,
              color: '#ef4444', fontFamily: "'Nunito',sans-serif",
              fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
            }}>
              🗑 Clear All ({toasts.length})
            </button>
          )}
        </div>
      )}
    </>
  );
}

// ── Timestamp helper ─────────────────────────────────────────────────────────
function fTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

// ── Shared slide-in wrapper ───────────────────────────────────────────────────
function ToastShell({ isDark, urgent, children, onClose, index = 0, exiting = false, accentColor }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10 + index);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (exiting) setVisible(false);
  }, [exiting]);
  function close() { setVisible(false); setTimeout(onClose, 320); }

  const border = accentColor
    ? (isDark ? `${accentColor}55` : `${accentColor}44`)
    : urgent
      ? (isDark ? 'rgba(239,68,68,0.4)' : '#fca5a5')
      : (isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0');

  const barGradient = accentColor
    ? `linear-gradient(90deg,${accentColor},${accentColor}cc)`
    : urgent
      ? 'linear-gradient(90deg,#dc2626,#ef4444)'
      : 'linear-gradient(90deg,#0d7377,#14a5ab)';

  return (
    <div className="hops-toast-shell" style={{
      borderRadius: 14,
      background: isDark ? '#0f2240' : '#ffffff',
      border: `1px solid ${border}`,
      boxShadow: 'none',
      overflow: 'hidden', fontFamily: "'Nunito',sans-serif",
      transform: visible ? 'translateX(0)' : 'translateX(110%)',
      opacity: visible ? 1 : 0,
      transition: 'transform 0.25s cubic-bezier(.22,1,.36,1), opacity 0.25s ease',
      flexShrink: 0,
    }}>
      <div style={{ height: 3, background: barGradient }} />
      {children(close, isDark)}
    </div>
  );
}

// ── Assignment toast (green, one-time) ───────────────────────────────────────
function AssignedToast({ task, createdAt, onDismiss, isDark, index, exiting }) {
  const titleColor = isDark ? '#ffffff' : '#0b1e3d';
  const subColor   = isDark ? 'rgba(255,255,255,0.5)' : '#6b7a90';
  const metaBg     = isDark ? 'rgba(255,255,255,0.05)' : '#f3f7fc';

  return (
    <ToastShell isDark={isDark} urgent={false} onClose={onDismiss} index={index} exiting={exiting}>
      {(close) => (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 14px 8px', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#1a7a4a,#27ae60)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📋</div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#1a7a4a', letterSpacing: 1, textTransform: 'uppercase' }}>New Task Assigned</span>
                  {createdAt && <span style={{ fontSize: 9.5, color: subColor, fontWeight: 600 }}>· {fTime(createdAt)}</span>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: titleColor, lineHeight: 1.3 }}>{task.name}</div>
              </div>
            </div>
            <button onClick={close} style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`, background: 'transparent', cursor: 'pointer', color: subColor, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 6, padding: '0 14px 12px', flexWrap: 'wrap' }}>
            {task.dept && <span style={{ fontSize: 10.5, background: metaBg, color: subColor, padding: '3px 8px', borderRadius: 20, fontWeight: 700 }}>🏢 {task.dept}</span>}
            {task.schedDate && <span style={{ fontSize: 10.5, background: metaBg, color: subColor, padding: '3px 8px', borderRadius: 20, fontWeight: 700 }}>📅 {task.schedDate}</span>}
            {task.time && <span style={{ fontSize: 10.5, background: metaBg, color: subColor, padding: '3px 8px', borderRadius: 20, fontWeight: 700 }}>⏰ {task.time}</span>}
            <span style={{ fontSize: 10.5, fontWeight: 800, color: task.priority === 'high' ? '#ef4444' : task.priority === 'medium' ? '#d4920a' : '#0d7377', background: task.priority === 'high' ? '#fef2f2' : task.priority === 'medium' ? '#fffbeb' : '#f0fdf4', padding: '3px 8px', borderRadius: 20, textTransform: 'uppercase' }}>{task.priority || 'medium'}</span>
          </div>
        </>
      )}
    </ToastShell>
  );
}

// ── Reminder toast (per-task, repeating) ─────────────────────────────────────
function ReminderToast({ task, subtype = 'regular', createdAt, onDismiss, isDark, index, exiting }) {
  const today      = toDay();
  const isOverdue  = task.schedDate && task.schedDate < today;
  const hasDueTime = task.schedDate === today && task.time;
  const urgent     = isOverdue || !!hasDueTime;
  const isHandover = subtype === 'handover';
  const isDelegation = subtype === 'delegation';

  const titleColor = isDark ? '#ffffff' : '#0b1e3d';
  const subColor   = isDark ? 'rgba(255,255,255,0.5)' : '#6b7a90';
  const metaBg     = isDark ? 'rgba(255,255,255,0.05)' : '#f3f7fc';
  const urgentMetaBg = isDark ? 'rgba(239,68,68,0.1)' : '#fff5f5';

  // When urgent: always red. Non-urgent: handover=purple, delegation=orange, regular=teal.
  const accentColor = urgent ? '#dc2626' : isHandover ? '#7c3aed' : isDelegation ? '#d97706' : '#0d7377';

  const iconGradient = urgent
    ? 'linear-gradient(135deg,#dc2626,#ef4444)'
    : isHandover
      ? 'linear-gradient(135deg,#6d28d9,#7c3aed)'
      : isDelegation
        ? 'linear-gradient(135deg,#b45309,#d97706)'
        : 'linear-gradient(135deg,#0d7377,#14a5ab)';

  const typeLabel = isHandover ? 'Handover' : isDelegation ? 'Delegation' : null;
  const headerLabel = isOverdue
    ? (typeLabel ? `Overdue ${typeLabel}` : 'Overdue Task')
    : hasDueTime
      ? (typeLabel ? `Due Today · ${typeLabel}` : 'Due Today')
      : (typeLabel ? `${typeLabel} Task` : 'Task Reminder');

  const icon = isOverdue ? '🚨' : hasDueTime ? '⏰' : isHandover ? '🔄' : isDelegation ? '📤' : '⏳';

  const nameColor = urgent ? (isDark ? '#fca5a5' : '#991b1b') : titleColor;

  return (
    <ToastShell isDark={isDark} urgent={urgent} onClose={onDismiss} index={index} exiting={exiting}
      accentColor={urgent ? undefined : isHandover ? '#7c3aed' : isDelegation ? '#d97706' : undefined}>
      {(close) => (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 14px 8px', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: iconGradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                {icon}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: accentColor, letterSpacing: 1, textTransform: 'uppercase' }}>{headerLabel}</span>
                  {createdAt && <span style={{ fontSize: 9.5, color: subColor, fontWeight: 600 }}>· {fTime(createdAt)}</span>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: nameColor, lineHeight: 1.3 }}>{task.name}</div>
              </div>
            </div>
            <button onClick={close} style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`, background: 'transparent', cursor: 'pointer', color: subColor, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 6, padding: '0 14px 12px', flexWrap: 'wrap' }}>
            {task.dept && <span style={{ fontSize: 10.5, background: metaBg, color: subColor, padding: '3px 8px', borderRadius: 20, fontWeight: 700 }}>🏢 {task.dept}</span>}
            {isOverdue && !isHandover && <span style={{ fontSize: 10.5, background: urgentMetaBg, color: '#dc2626', padding: '3px 8px', borderRadius: 20, fontWeight: 800 }}>📅 OVERDUE — {task.schedDate}</span>}
            {(!isOverdue || isHandover) && task.schedDate && <span style={{ fontSize: 10.5, background: metaBg, color: subColor, padding: '3px 8px', borderRadius: 20, fontWeight: 700 }}>📅 {task.schedDate}</span>}
            {task.time && <span style={{ fontSize: 10.5, background: isOverdue && !isHandover ? urgentMetaBg : metaBg, color: isOverdue && !isHandover ? '#dc2626' : subColor, padding: '3px 8px', borderRadius: 20, fontWeight: isOverdue ? 800 : 700 }}>⏰ {task.time}</span>}
            <span style={{ fontSize: 10.5, fontWeight: 800, color: task.priority === 'high' ? '#ef4444' : task.priority === 'medium' ? '#d4920a' : '#0d7377', background: task.priority === 'high' ? '#fef2f2' : task.priority === 'medium' ? '#fffbeb' : '#f0fdf4', padding: '3px 8px', borderRadius: 20, textTransform: 'uppercase' }}>{task.priority || 'medium'}</span>
          </div>
        </>
      )}
    </ToastShell>
  );
}

// ── Handover Request toast (yellow, for toName — new incoming request) ────────
function HandoverRequestToast({ handover: hv, createdAt, onDismiss, isDark, index, exiting }) {
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6b7a90';
  const metaBg   = isDark ? 'rgba(255,255,255,0.05)' : '#f3f7fc';
  const titleColor = isDark ? '#ffffff' : '#0b1e3d';

  return (
    <ToastShell isDark={isDark} urgent={false} onClose={onDismiss} index={index} exiting={exiting} accentColor="#d97706">
      {(close) => (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 14px 8px', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#b45309,#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🔔</div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#d97706', letterSpacing: 1, textTransform: 'uppercase' }}>Handover Request</span>
                  {createdAt && <span style={{ fontSize: 9.5, color: subColor, fontWeight: 600 }}>· {fTime(createdAt)}</span>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: titleColor, lineHeight: 1.3 }}>
                  {hv.fromName} has handed over tasks to you
                </div>
              </div>
            </div>
            <button onClick={close} style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`, background: 'transparent', cursor: 'pointer', color: subColor, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 6, padding: '0 14px 12px', flexWrap: 'wrap' }}>
            {hv.dept && <span style={{ fontSize: 10.5, background: metaBg, color: subColor, padding: '3px 8px', borderRadius: 20, fontWeight: 700 }}>🏢 {hv.dept}</span>}
            {hv.dateStart && <span style={{ fontSize: 10.5, background: metaBg, color: subColor, padding: '3px 8px', borderRadius: 20, fontWeight: 700 }}>📅 {hv.dateStart} → {hv.dateEnd}</span>}
            <span style={{ fontSize: 10.5, background: isDark ? 'rgba(217,119,6,0.15)' : '#fffbeb', color: '#d97706', padding: '3px 8px', borderRadius: 20, fontWeight: 800 }}>
              📋 {(hv.taskIds || []).length} Tasks
            </span>
          </div>
        </>
      )}
    </ToastShell>
  );
}

// ── Handover Response toast (green/red, for fromName — accepted or rejected) ──
function HandoverResponseToast({ handover: hv, createdAt, onDismiss, isDark, index, exiting }) {
  const accepted   = hv.status === 'accepted';
  const subColor   = isDark ? 'rgba(255,255,255,0.5)' : '#6b7a90';
  const metaBg     = isDark ? 'rgba(255,255,255,0.05)' : '#f3f7fc';
  const titleColor = isDark ? '#ffffff' : '#0b1e3d';
  const accent     = accepted ? '#16a34a' : '#dc2626';
  const iconGrad   = accepted ? 'linear-gradient(135deg,#15803d,#16a34a)' : 'linear-gradient(135deg,#b91c1c,#dc2626)';

  return (
    <ToastShell isDark={isDark} urgent={!accepted} onClose={onDismiss} index={index} exiting={exiting}
      accentColor={accepted ? '#16a34a' : undefined}>
      {(close) => (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 14px 8px', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: iconGrad, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                {accepted ? '✅' : '❌'}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: accent, letterSpacing: 1, textTransform: 'uppercase' }}>
                    Handover {accepted ? 'Accepted' : 'Rejected'}
                  </span>
                  {createdAt && <span style={{ fontSize: 9.5, color: subColor, fontWeight: 600 }}>· {fTime(createdAt)}</span>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: accepted ? titleColor : (isDark ? '#fca5a5' : '#991b1b'), lineHeight: 1.3 }}>
                  {hv.toName} has {accepted ? 'accepted' : 'rejected'} the handover
                </div>
              </div>
            </div>
            <button onClick={close} style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`, background: 'transparent', cursor: 'pointer', color: subColor, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 6, padding: '0 14px 12px', flexWrap: 'wrap' }}>
            {hv.dept && <span style={{ fontSize: 10.5, background: metaBg, color: subColor, padding: '3px 8px', borderRadius: 20, fontWeight: 700 }}>🏢 {hv.dept}</span>}
            {hv.dateStart && <span style={{ fontSize: 10.5, background: metaBg, color: subColor, padding: '3px 8px', borderRadius: 20, fontWeight: 700 }}>📅 {hv.dateStart} → {hv.dateEnd}</span>}
            {!accepted && hv.remark && <span style={{ fontSize: 10.5, background: isDark ? 'rgba(239,68,68,0.1)' : '#fff5f5', color: '#dc2626', padding: '3px 8px', borderRadius: 20, fontWeight: 700 }}>💬 {hv.remark}</span>}
          </div>
        </>
      )}
    </ToastShell>
  );
}
