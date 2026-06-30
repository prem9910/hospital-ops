import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { uid, toDay, fDate, fDateTime, notifyAdmins, exportToExcel } from '../utils';
import { Modal } from '../components/common/Modal';
import { Alert, EmptyState } from '../components/common/Alert';

const IS = { width: '100%', padding: '9px 13px', borderRadius: 8, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 13, color: '#1a2535', outline: 'none', background: 'white', fontWeight: 600 };
function Field({ label, children }) {
  return <div style={{ marginBottom: 13 }}><label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</label>{children}</div>;
}

const STATUS_COLORS = { pending: '#d4920a', accepted: '#0d7377', done: '#1a7a4a', 'extension-requested': '#6d28d9', extended: '#c05a00', rejected: '#c0392b' };

export default function Delegations() {
  const { currentRole, currentUser, hasPerm } = useAuth();
  const { delegations, employees, depts, notices, save, logAct } = useApp();
  const [filter, setFilter] = useState('');
  // ?focus=<delegationId> — set by the dashboard drilldown's "Open in
  // Delegations" button. On mount, scroll the matching card into view and
  // highlight it briefly. We also clear the active status filter so the
  // focused row is always visible regardless of what was filtered before.
  const [searchParams, setSearchParams] = useSearchParams();
  const [highlightId, setHighlightId] = useState(null);
  const focusId = searchParams.get('focus');
  useEffect(() => {
    if (!focusId) return;
    setFilter('');
    setHighlightId(focusId);
    requestAnimationFrame(() => {
      const el = document.getElementById(`delegation-card-${focusId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    setSearchParams((prev) => { prev.delete('focus'); return prev; }, { replace: true });
    const t = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);
  const [showForm, setShowForm] = useState(false);
  const [showExtModal, setShowExtModal] = useState(null);
  const [extReason, setExtReason] = useState('');
  const [extDate, setExtDate] = useState('');
  const [form, setForm] = useState({ task: '', doerName: '', dept: '', dueDate: '', remarks: '' });

  const canAdd = currentRole === 'mainadmin' || hasPerm('delegation_add');
  const isMain = currentRole === 'mainadmin';

  const filtered = delegations.filter((d) => !filter || d.status === filter);

  // Delegations whose task name is missing or literally "Unknown task".
  // Surfaced so the user can spot legacy data — click to remove.
  const badRows = useMemo(
    () => delegations.filter((d) => !d.task || !String(d.task).trim() || /unknown/i.test(d.task)),
    [delegations],
  );

  async function cleanBadRows() {
    if (!badRows.length) return;
    const ok = window.confirm(
      `Found ${badRows.length} delegation(s) with missing/Unknown task name. Delete them permanently? This cannot be undone.`,
    );
    if (!ok) return;
    const keep = delegations.filter((d) => d.task && String(d.task).trim() && !/unknown/i.test(d.task));
    await save('workdesk-delegations', keep);
    await logAct('CLEANUP', `Removed ${badRows.length} empty/unknown delegation(s)`);
  }

  async function handleSave() {
    if (!form.task.trim()) { alert('Task name is required — please describe what needs to be done.'); return; }
    if (!form.doerName) { alert('Please pick who will do this task (Doer).'); return; }
    if (!form.dueDate) { alert('Due Date is required.'); return; }
    const obj = { id: uid(), task: form.task.toUpperCase(), doerName: form.doerName.toUpperCase(), dept: form.dept, dueDate: form.dueDate, remarks: form.remarks, status: 'pending', createdBy: currentUser.name, createdAt: toDay(), extensionRequests: [] };
    await save('workdesk-delegations', [...delegations, obj]);
    await logAct('DELEGATION CREATED', obj.task);
    setShowForm(false);
    setForm({ task: '', doerName: '', dept: '', dueDate: '', remarks: '' });
  }

  async function changeStatus(d, newStatus) {
    const updated = { ...d, status: newStatus };
    await save('workdesk-delegations', delegations.map((x) => x.id === d.id ? updated : x));
    await logAct('DELEGATION STATUS: ' + newStatus.toUpperCase(), d.task);
    // Notify main admin bell when delegation is completed or status changes.
    // Body is laid out as a clean labelled report (mirrors the task-completion
    // notice style in Tasks.jsx) — left-aligned field labels, padded so they
    // line up in monospace bell preview. No time stamp is included here on
    // purpose: delegations are date-bounded, not time-bounded.
    const label = (txt, w = 14) => String(txt).padEnd(w, ' ');
    const bodyLines = [
      label('Task:') + d.task,
      label('Department:') + (d.dept || '—'),
      label('Status:') + newStatus.toUpperCase(),
      label('Done By:') + d.doerName,
      label('Due Date:') + (d.dueDate ? fDate(d.dueDate) : '—'),
      label('Delegated By:') + (d.createdBy || '—'),
    ];
    if (d.remarks) bodyLines.push(label('Remarks:') + d.remarks);
    try {
      await notifyAdmins({
        notices, save,
        subject: newStatus === 'done'
          ? `✅ Delegation Completed — ${d.task}`
          : `🔄 Delegation ${newStatus.toUpperCase()} — ${d.task}`,
        message: bodyLines.join('\n'),
        type: newStatus === 'done' ? 'delegation_completed' : 'delegation_status',
        meta: { delegationId: d.id, doer: d.doerName, status: newStatus, taskName: d.task, dept: d.dept, dueDate: d.dueDate, remarks: d.remarks, delegatedBy: d.createdBy },
      });
    } catch (e) { console.error('Admin notify failed:', e); }
  }

  async function submitExtension() {
    if (!extReason.trim() || !extDate) { alert('Reason and new date required!'); return; }
    // Cap extensions at 3 per delegation — anything beyond that means the
    // task should be re-delegated or escalated rather than repeatedly
    // pushed out. The cap is enforced at submit-time so the user sees an
    // immediate error instead of the admin silently rejecting later.
    const existing = showExtModal.extensionRequests || [];
    if (existing.length >= 3) {
      alert(`This delegation has already used its 3 allowed extensions. Please close it out, escalate to admin, or re-delegate the task instead of requesting another extension.`);
      return;
    }
    const req = { requestedAt: new Date().toISOString(), reason: extReason.toUpperCase(), newDate: extDate };
    const updated = { ...showExtModal, status: 'extension-requested', extensionRequests: [...existing, req] };
    await save('workdesk-delegations', delegations.map((x) => x.id === showExtModal.id ? updated : x));
    await logAct('EXTENSION REQUESTED', showExtModal.task);
    setShowExtModal(null); setExtReason(''); setExtDate('');
  }

  async function approveExtension(d) {
    const lastReq = (d.extensionRequests || []).slice(-1)[0];
    if (!lastReq) return;
    const updated = { ...d, status: 'extended', dueDate: lastReq.newDate };
    await save('workdesk-delegations', delegations.map((x) => x.id === d.id ? updated : x));
    await logAct('EXTENSION APPROVED', d.task);
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-header-title" style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>Delegation Tracker</h2>
        <div className="page-header-actions">
          {badRows.length > 0 && (
            <button
              onClick={cleanBadRows}
              title={`${badRows.length} delegation(s) have empty or "Unknown" task names`}
              style={{ padding: '7px 14px', borderRadius: 8, background: '#c0392b', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}
            >
              🧹 Clean {badRows.length} bad row{badRows.length === 1 ? '' : 's'}
            </button>
          )}
          <button onClick={() => exportToExcel(filtered.map(d => ({ 'Task Name': d.task, Department: d.dept || '—', 'Delegated By': d.createdBy || '—', 'Delegated To': d.doerName, Status: d.status, 'Due Date': d.dueDate, Remarks: d.remarks || '', 'Extensions Used': (d.extensionRequests || []).length })), 'delegations-export')} style={{ padding: '7px 14px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>⬇ Export</button>
          <button onClick={() => window.print()} style={{ padding: '7px 14px', borderRadius: 8, background: '#334155', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>🖨 Print</button>
          {canAdd && <button onClick={() => setShowForm(true)} style={{ padding: '7px 14px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>+ Delegate Task</button>}
        </div>
      </div>

      {badRows.length > 0 && (
        <div style={{ background: '#fff5f5', border: '1px solid #f5c6cb', borderLeft: '4px solid #c0392b', borderRadius: 9, padding: '10px 14px', marginBottom: 14, fontSize: 12.5, color: '#7d1a1a', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <strong>{badRows.length} delegation{badRows.length === 1 ? '' : 's'}</strong> have a missing or "Unknown" task name (legacy data).
            Click <strong>🧹 Clean {badRows.length} bad row{badRows.length === 1 ? '' : 's'}</strong> above to delete them permanently.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
        {['', 'pending', 'accepted', 'done', 'extension-requested', 'extended', 'rejected'].map((s) => (
          <button key={s} onClick={() => setFilter(s)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 800, border: `1.5px solid ${filter === s ? '#0d7377' : '#d8e2ef'}`, background: filter === s ? '#0d7377' : 'white', color: filter === s ? 'white' : '#6b7a90', cursor: 'pointer' }}>
            {s || 'ALL'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length ? filtered.map((d) => (
          <div
            key={d.id}
            id={`delegation-card-${d.id}`}
            style={{
              background: d.id === highlightId ? '#fff7d6' : 'white',
              borderRadius: 12,
              border: `1px solid ${d.id === highlightId ? '#fbbf24' : '#d8e2ef'}`,
              padding: '14px 16px',
              borderLeft: `4px solid ${STATUS_COLORS[d.status] || '#6b7a90'}`,
              transition: 'background 0.6s, border-color 0.6s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <strong style={{ fontSize: 14, color: d.task ? '#0b1e3d' : '#c0392b' }}>{d.task || '— Untitled task —'}</strong>
              <span style={{ background: STATUS_COLORS[d.status] || '#6b7a90', color: 'white', padding: '3px 10px', borderRadius: 20, fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase' }}>{d.status}</span>
            </div>
            <div style={{ fontSize: 12, color: '#6b7a90', marginTop: 5 }}>
              👤 {d.doerName} &nbsp;|&nbsp; 🏢 {d.dept || '—'} &nbsp;|&nbsp; 📅 Due: {fDate(d.dueDate)} &nbsp;|&nbsp; By: {d.createdBy}
            </div>
            {d.remarks && <div style={{ fontSize: 11, color: '#6b7a90', marginTop: 4 }}>📝 {d.remarks}</div>}
            {(d.extensionRequests || []).length > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, background: '#faf5ff', padding: '5px 9px', borderRadius: 7, color: '#6d28d9' }}>
                🔄 Extension: {d.extensionRequests.slice(-1)[0]?.reason} → {fDate(d.extensionRequests.slice(-1)[0]?.newDate)}
              </div>
            )}
            <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
              {d.status === 'pending' && <button onClick={() => changeStatus(d, 'accepted')} style={{ padding: '4px 10px', borderRadius: 7, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>▶ Accept</button>}
              {(d.status === 'accepted' || d.status === 'extended') && <>
                <button onClick={() => changeStatus(d, 'done')} style={{ padding: '4px 10px', borderRadius: 7, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>✅ Done</button>
                <button onClick={() => setShowExtModal(d)} style={{ padding: '4px 10px', borderRadius: 7, background: '#6d28d9', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>🔄 Request Ext.</button>
              </>}
              {isMain && d.status === 'extension-requested' && <>
                <button onClick={() => approveExtension(d)} style={{ padding: '4px 10px', borderRadius: 7, background: '#c05a00', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>✅ Approve Ext.</button>
                <button onClick={() => changeStatus(d, 'rejected')} style={{ padding: '4px 10px', borderRadius: 7, background: '#c0392b', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>❌ Reject</button>
              </>}
            </div>
          </div>
        )) : <EmptyState icon="📤" message="NO DELEGATIONS FOUND" />}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Delegate Task">
        <Field label="Task / Work *"><textarea value={form.task} onChange={(e) => setForm({ ...form, task: e.target.value })} placeholder="WHAT NEEDS TO BE DONE..." style={{ ...IS, minHeight: 70, resize: 'vertical' }} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Assign To *"><select value={form.doerName} onChange={(e) => setForm({ ...form, doerName: e.target.value })} style={IS}><option value="">Select Employee...</option>{employees.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}</select></Field>
          <Field label="Department"><select value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value })} style={IS}><option value="">Select...</option>{depts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}</select></Field>
          <Field label="Due Date *"><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} style={IS} /></Field>
        </div>
        <Field label="Remarks"><textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="ADDITIONAL NOTES..." style={{ ...IS, minHeight: 55, resize: 'vertical' }} /></Field>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid #d8e2ef' }}>
          <button onClick={handleSave} style={{ padding: '9px 18px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>📤 Delegate</button>
          <button onClick={() => setShowForm(false)} style={{ padding: '9px 18px', borderRadius: 8, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>Cancel</button>
        </div>
      </Modal>

      <Modal open={!!showExtModal} onClose={() => setShowExtModal(null)} title="Request Extension">
        {showExtModal && <>
          <Alert variant="purple">Extension request will be sent to admin for approval.</Alert>
          {(() => {
            const used = (showExtModal.extensionRequests || []).length;
            const remaining = Math.max(0, 3 - used);
            if (remaining === 0) {
              return <Alert variant="red">🚫 Maximum 3 extensions already used. Please close out, escalate, or re-delegate this task instead.</Alert>;
            }
            return <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', padding: '8px 12px', borderRadius: 8, fontSize: 11.5, color: '#6d28d9', marginBottom: 12, fontWeight: 700 }}>
              📊 Extensions used: <strong>{used}/3</strong> — {remaining} remaining.
            </div>;
          })()}
          <Field label="Reason for Extension *"><textarea value={extReason} onChange={(e) => setExtReason(e.target.value)} placeholder="WHY DO YOU NEED MORE TIME..." style={{ ...IS, minHeight: 70, resize: 'vertical' }} /></Field>
          <Field label="New Due Date *"><input type="date" value={extDate} onChange={(e) => setExtDate(e.target.value)} style={IS} /></Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid #d8e2ef' }}>
            <button
              onClick={submitExtension}
              disabled={(showExtModal.extensionRequests || []).length >= 3}
              style={{ padding: '9px 18px', borderRadius: 8, background: (showExtModal.extensionRequests || []).length >= 3 ? '#cbd5e1' : '#6d28d9', color: 'white', border: 'none', cursor: (showExtModal.extensionRequests || []).length >= 3 ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13 }}
            >🔄 Submit Request</button>
            <button onClick={() => setShowExtModal(null)} style={{ padding: '9px 18px', borderRadius: 8, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>Cancel</button>
          </div>
        </>}
      </Modal>
    </div>
  );
}
