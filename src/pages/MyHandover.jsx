import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { toDay, fDate, notifyAdmins, exportToExcel } from '../utils';
import { DeptTag } from '../components/common/Badge';
import { sendHandoverResponseEmail, sendHandoverTasksEmail } from '../lib/emailService';

function handoverStatus(h) {
  const today = toDay();
  if (!h.dateStart) return 'old';
  if (today < h.dateStart) return 'upcoming';
  if (today > h.dateEnd) return 'completed';
  return 'active';
}

const STATUS_CFG = {
  active:    { label: '🟢 ACTIVE',    bg: '#d4edda', color: '#155724' },
  upcoming:  { label: '🔵 UPCOMING',  bg: '#cfe2ff', color: '#0a3870' },
  completed: { label: '✅ COMPLETED', bg: '#e4eaf2', color: '#4a5568' },
  old:       { label: '📋 OLD',       bg: '#f3f7fc', color: '#6b7a90' },
};

const DECISION_CFG = {
  accepted:  { label: '✅ ACCEPTED',  bg: '#d4edda', color: '#155724' },
  rejected:  { label: '❌ REJECTED',  bg: '#fde8e8', color: '#c0392b' },
  cancelled: { label: '🚫 CANCELLED', bg: '#f3f7fc', color: '#6b7a90' },
};

export default function MyHandover() {
  const { currentUser } = useAuth();
  const { tasks, handovers, employees, notices, save, logAct, moveToTrash } = useApp();

  const [remarks, setRemarks] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  // Email popup for missing fromName email
  const [emailPopup, setEmailPopup] = useState(null); // { emp, handover, decision }
  const [popupEmail, setPopupEmail] = useState('');

  const myName = currentUser.name.toUpperCase();

  // Only handovers sent TO me
  const incomingHandovers = handovers
    .filter(h => (h.toName || '').toUpperCase() === myName)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const pendingCount = incomingHandovers.filter(h => h.status === 'pending').length;
  const acceptedActive = incomingHandovers.filter(h => h.status === 'accepted' && handoverStatus(h) === 'active').length;

  async function handleDecision(h, decision) {
    const remark = (remarks[h.id] || '').trim();
    if (decision === 'rejected' && !remark) {
      alert('A remark is required to reject this handover!');
      return;
    }
    if (saving) return;
    setSaving(true);
    const updated = {
      ...h,
      status: decision,
      decisionBy: currentUser.name,
      decisionAt: toDay(),
      decisionRemark: remark,
    };
    try {
      await save('workdesk-handovers', handovers.map(x => x.id === h.id ? updated : x));
      await logAct(`HANDOVER ${decision.toUpperCase()}`, `${h.fromName} → ${h.toName} | Remark: ${remark || '-'}`);
      // Notify main admin bell
      try {
        await notifyAdmins({
          notices, save,
          subject: decision === 'accepted'
            ? `✅ ${currentUser.name} accepted handover from ${h.fromName}`
            : `❌ ${currentUser.name} rejected handover from ${h.fromName}`,
          message: `From: ${h.fromName}\nTo: ${h.toName}\nDecision: ${decision.toUpperCase()}\n${remark ? 'Remark: ' + remark : ''}\nTasks: ${(h.taskIds || []).length}`,
          type: 'handover_response',
          meta: { handoverId: h.id, fromName: h.fromName, toName: h.toName, decision, taskCount: (h.taskIds || []).length },
        });
      } catch (e) { console.error('Admin notify failed:', e); }

      // Notify the original creator (fromName) with a personal bell notice
      // — only if the creator exists in the employees table. Notice includes
      //   the decision remark so the creator knows exactly why their handover
      //   was accepted/rejected without having to open the handover register.
      const fromEmp = employees.find(e => e.name.toUpperCase() === (h.fromName || '').toUpperCase());
      try {
        if (fromEmp) {
          const creatorNotice = {
            id: 'notice_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            toEmpId: fromEmp.id,
            toName: fromEmp.name,
            fromName: currentUser.name,
            subject: decision === 'accepted'
              ? `✅ ${currentUser.name} accepted your handover`
              : `❌ ${currentUser.name} rejected your handover`,
            message:
              `Your handover to ${h.toName} was ${decision.toUpperCase()} by ${currentUser.name}.\n` +
              `Department: ${h.dept || '—'}\n` +
              `Tasks included: ${(h.taskIds || []).length}\n` +
              (remark ? `\n💬 Remark: ${remark}` : ''),
            type: 'handover_response',
            isRead: false,
            sentAt: new Date().toISOString(),
            meta: {
              handoverId: h.id,
              fromName: h.fromName,
              toName: h.toName,
              decision,
              taskCount: (h.taskIds || []).length,
              remark,
              decidedBy: currentUser.name,
            },
          };
          await save('workdesk-notices', [...(notices || []), creatorNotice]);
        }
      } catch (e) { console.error('Creator notify failed:', e); }

      setRemarks(r => { const n = { ...r }; delete n[h.id]; return n; });
      setMsg(`✅ Handover ${decision === 'accepted' ? 'accepted' : 'rejected'} successfully!`);
      setTimeout(() => setMsg(''), 3000);

      // If accepted → email task details to toName (current user = me)
      if (decision === 'accepted') {
        const taskList = (h.taskIds || [])
          .map(id => tasks.find(t => t.id === id))
          .filter(Boolean);
        const toEmp = employees.find(e => e.name.toUpperCase() === myName);
        if (toEmp) {
          if (toEmp.email) {
            sendHandoverTasksEmail(updated, toEmp, taskList);
          } else {
            // reuse popup — send tasks email after email collected
            setEmailPopup({ emp: toEmp, handover: updated, decision, sendTasks: true, taskList });
            setPopupEmail('');
          }
        }
      }

      // Email to fromName (creator) — reuse fromEmp lookup from notice block above
      if (fromEmp) {
        if (fromEmp.email) {
          sendHandoverResponseEmail(updated, fromEmp, decision);
        } else {
          setEmailPopup({ emp: fromEmp, handover: updated, decision });
          setPopupEmail('');
        }
      }
    } finally { setSaving(false); }
  }

  async function handlePopupSend() {
    if (!popupEmail.trim() || !popupEmail.includes('@')) { alert('Please enter a valid email address!'); return; }
    const { emp, handover, decision, sendTasks, taskList } = emailPopup;
    const empWithEmail = { ...emp, email: popupEmail.trim() };
    const updatedEmps = employees.map(e => e.id === emp.id ? { ...e, email: popupEmail.trim() } : e);
    await save('workdesk-employees', updatedEmps);
    if (sendTasks && taskList) {
      sendHandoverTasksEmail(handover, empWithEmail, taskList);
    } else {
      sendHandoverResponseEmail(handover, empWithEmail, decision);
    }
    setEmailPopup(null);
  }

  async function handleDelete(h) {
    if (deletingId) return;
    if (!window.confirm('Delete this handover from your list? (Admin will still have it on the register.)')) return;
    setDeletingId(h.id);
    try {
      const result = await moveToTrash('handover', h.id);
      if (result && result.error) {
        alert('Could not delete from database. Please check your connection and try again.');
      } else {
        setMsg('✅ Handover removed.');
        setTimeout(() => setMsg(''), 2500);
      }
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>

      {/* ── Email Popup ── */}
      {emailPopup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 28, maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 28, marginBottom: 8, textAlign: 'center' }}>📧</div>
            <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: '#0b1e3d', margin: '0 0 6px', textAlign: 'center' }}>Email ID Missing</h3>
            <p style={{ fontSize: 13, color: '#4a5568', textAlign: 'center', marginBottom: 18 }}>
              <strong>{emailPopup.emp.name}</strong> does not have an email address on file.<br />
              Enter an email address to send the handover {emailPopup.decision} notification:
            </p>
            <input
              type="email"
              value={popupEmail}
              onChange={e => setPopupEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePopupSend()}
              placeholder="employee@email.com"
              autoFocus
              style={{ width: '100%', padding: '10px 13px', borderRadius: 8, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 13, color: '#1a2535', outline: 'none', boxSizing: 'border-box', marginBottom: 14 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handlePopupSend} style={{ flex: 1, padding: '9px 0', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>📨 Save & Send Email</button>
              <button onClick={() => setEmailPopup(null)} style={{ padding: '9px 14px', borderRadius: 8, background: 'transparent', color: '#6b7a90', border: '1.5px solid #d8e2ef', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Skip</button>
            </div>
            <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 10, marginBottom: 0 }}>The email will also be saved to the employee's record</p>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
          <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>📥 Incoming Handovers</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => exportToExcel(incomingHandovers.map(h => ({ From: h.fromName, Department: h.dept, 'Start Date': h.dateStart, 'End Date': h.dateEnd, Status: h.status, Reason: h.reason })), 'my-handovers')} style={{ padding: '7px 14px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>⬇ Export</button>
            <button onClick={() => window.print()} style={{ padding: '7px 14px', borderRadius: 8, background: '#334155', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>🖨 Print</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {pendingCount > 0 && (
            <span style={{ background: '#fff3cd', color: '#7a4800', padding: '4px 12px', borderRadius: 20, fontSize: 11.5, fontWeight: 800, border: '1px solid #f5c842' }}>
              ⏳ {pendingCount} Pending Response
            </span>
          )}
          {acceptedActive > 0 && (
            <span style={{ background: '#d4edda', color: '#155724', padding: '4px 12px', borderRadius: 20, fontSize: 11.5, fontWeight: 800 }}>
              🟢 {acceptedActive} Active Right Now
            </span>
          )}
        </div>
      </div>

      {msg && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 9, background: '#d4edda', color: '#155724', fontWeight: 700, fontSize: 13 }}>
          {msg}
        </div>
      )}

      {incomingHandovers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#6b7a90' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📥</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, marginBottom: 6 }}>No Incoming Handovers</div>
          <div style={{ fontSize: 12 }}>When someone handovers a task to you, it will appear here</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {incomingHandovers.map(h => {
            const st = handoverStatus(h);
            const sc = STATUS_CFG[st];
            const taskObjs = (h.taskIds || []).map(id => tasks.find(t => t.id === id)).filter(Boolean);
            const doneCount = taskObjs.filter(t => t.status === 'done').length;
            const isPending = h.status === 'pending';
            const isAccepted = h.status === 'accepted';
            const decCfg = DECISION_CFG[h.status];
            const borderColor = isPending ? '#f5c842' : isAccepted ? '#86efac' : h.status === 'rejected' ? '#f87171' : '#d8e2ef';
            const bgColor = isPending ? '#fffdf0' : isAccepted ? '#f0fdf4' : 'white';

            return (
              <div key={h.id} style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 13, padding: '16px 18px', borderLeft: `4px solid ${isPending ? '#f5c842' : isAccepted ? '#1a7a4a' : h.status === 'rejected' ? '#c0392b' : '#6b7a90'}` }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  <div>
                    <span style={{ fontWeight: 800, fontSize: 15, color: '#1a2535' }}>{h.fromName}</span>
                    <span style={{ color: '#6b7a90', fontSize: 13, margin: '0 6px' }}>→ is handing over to you</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ background: sc.bg, color: sc.color, padding: '3px 10px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>{sc.label}</span>
                    {decCfg && <span style={{ background: decCfg.bg, color: decCfg.color, padding: '3px 10px', borderRadius: 20, fontSize: 10.5, fontWeight: 800 }}>{decCfg.label}</span>}
                    {isPending && <span style={{ background: '#fff3cd', color: '#7a4800', padding: '3px 10px', borderRadius: 20, fontSize: 10.5, fontWeight: 800, border: '1px solid #f5c842' }}>⏳ AWAITING YOUR RESPONSE</span>}
                  </div>
                </div>

                {/* Meta */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: '#6b7a90', marginBottom: 10, alignItems: 'center' }}>
                  {h.dept && <DeptTag name={h.dept} />}
                  {h.dateStart && <span>📅 {fDate(h.dateStart)} → {fDate(h.dateEnd)}</span>}
                  <span style={{ fontWeight: 700, color: '#0d7377' }}>📌 {(h.taskIds || []).length} tasks ({doneCount} done)</span>
                  {h.createdAt && <span>Submitted: {h.createdAt.slice(0, 10)}</span>}
                </div>

                {/* Notes */}
                {h.notes && (
                  <div style={{ fontSize: 12, color: '#1a2535', background: '#f8fbff', padding: '8px 11px', borderRadius: 8, marginBottom: 10, borderLeft: '3px solid #0d7377' }}>
                    📝 <strong>Reason:</strong> {h.notes}
                  </div>
                )}

                {/* Task list */}
                {taskObjs.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Tasks included:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {taskObjs.map(t => (
                        <span key={t.id} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 700, background: t.status === 'done' ? '#d4edda' : '#f3f7fc', color: t.status === 'done' ? '#155724' : '#1a2535', border: `1px solid ${t.status === 'done' ? '#86efac' : '#d8e2ef'}` }}>
                          {t.status === 'done' ? '✅' : '⏳'} {t.name}
                        </span>
                      ))}
                    </div>
                    {taskObjs.length > 0 && (
                      <div style={{ marginTop: 8, height: 4, background: '#e4eaf2', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(doneCount / taskObjs.length) * 100}%`, background: '#0d7377', borderRadius: 10, transition: 'width 0.4s' }} />
                      </div>
                    )}
                  </div>
                )}

                {/* Decision remark display (if already decided) */}
                {h.decisionRemark && (
                  <div style={{ fontSize: 12, background: '#f8fbff', padding: '7px 11px', borderRadius: 8, marginBottom: 10, color: '#4a5568' }}>
                    💬 <strong>Your remark:</strong> {h.decisionRemark}
                  </div>
                )}

                {/* Accept / Reject UI — only if pending */}
                {isPending && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e4eaf2' }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>
                      Remark (required for rejection)
                    </label>
                    <textarea
                      value={remarks[h.id] || ''}
                      onChange={e => setRemarks(r => ({ ...r, [h.id]: e.target.value }))}
                      placeholder="Enter a remark (optional for accept, required for reject)..."
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 13, color: '#1a2535', outline: 'none', minHeight: 60, resize: 'vertical', boxSizing: 'border-box', marginBottom: 10 }}
                    />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleDecision(h, 'accepted')}
                        disabled={saving || deletingId === h.id}
                        style={{ padding: '8px 20px', borderRadius: 8, background: saving ? '#6b7a90' : '#1a7a4a', color: 'white', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13 }}
                      >
                        {saving ? '⏳...' : '✅ Accept'}
                      </button>
                      <button
                        onClick={() => handleDecision(h, 'rejected')}
                        disabled={saving || deletingId === h.id}
                        style={{ padding: '8px 20px', borderRadius: 8, background: saving ? '#6b7a90' : '#c0392b', color: 'white', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13 }}
                      >
                        {saving ? '⏳...' : '❌ Reject'}
                      </button>
                      <button
                        onClick={() => handleDelete(h)}
                        disabled={saving || deletingId === h.id}
                        style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 7, background: 'transparent', border: '1px solid #d8e2ef', color: '#c0392b', cursor: deletingId === h.id ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 11.5 }}
                      >
                        {deletingId === h.id ? '⏳ Deleting...' : '🗑️ Delete'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Delete button for non-pending handovers (already decided) */}
                {!isPending && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #e4eaf2', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => handleDelete(h)}
                      disabled={deletingId === h.id}
                      style={{ padding: '6px 12px', borderRadius: 7, background: 'transparent', border: '1px solid #d8e2ef', color: '#c0392b', cursor: deletingId === h.id ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 11.5 }}
                    >
                      {deletingId === h.id ? '⏳ Deleting...' : '🗑️ Delete'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
