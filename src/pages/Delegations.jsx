import { useState } from 'react';
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
  const [showForm, setShowForm] = useState(false);
  const [showExtModal, setShowExtModal] = useState(null);
  const [extReason, setExtReason] = useState('');
  const [extDate, setExtDate] = useState('');
  const [form, setForm] = useState({ task: '', doerName: '', dept: '', dueDate: '', remarks: '' });

  const canAdd = currentRole === 'mainadmin' || hasPerm('delegation_add');
  const isMain = currentRole === 'mainadmin';

  const filtered = delegations.filter((d) => !filter || d.status === filter);

  async function handleSave() {
    if (!form.task.trim() || !form.doerName || !form.dueDate) { alert('Task, Doer, Due Date required!'); return; }
    const obj = { id: uid(), task: form.task.toUpperCase(), doerName: form.doerName.toUpperCase(), dept: form.dept, dueDate: form.dueDate, remarks: form.remarks, status: 'pending', createdBy: currentUser.name, createdAt: toDay(), extensionRequests: [] };
    await save('hops-delegations', [...delegations, obj]);
    await logAct('DELEGATION CREATED', obj.task);
    setShowForm(false);
    setForm({ task: '', doerName: '', dept: '', dueDate: '', remarks: '' });
  }

  async function changeStatus(d, newStatus) {
    const updated = { ...d, status: newStatus };
    await save('hops-delegations', delegations.map((x) => x.id === d.id ? updated : x));
    await logAct('DELEGATION STATUS: ' + newStatus.toUpperCase(), d.task);
    // Notify main admin bell when delegation is completed or status changes
    try {
      await notifyAdmins({
        notices, save,
        subject: newStatus === 'done' ? `✅ ${d.doerName} completed delegation: ${d.task}` : `🔄 ${d.doerName} → ${newStatus.toUpperCase()}: ${d.task}`,
        message: `Delegation: ${d.task}\nDoer: ${d.doerName}\nNew Status: ${newStatus.toUpperCase()}\n${d.remarks ? 'Remarks: ' + d.remarks : ''}`,
        type: newStatus === 'done' ? 'delegation_completed' : 'delegation_status',
        meta: { delegationId: d.id, doer: d.doerName, status: newStatus, taskName: d.task },
      });
    } catch (e) { console.error('Admin notify failed:', e); }
  }

  async function submitExtension() {
    if (!extReason.trim() || !extDate) { alert('Reason and new date required!'); return; }
    const req = { requestedAt: new Date().toISOString(), reason: extReason.toUpperCase(), newDate: extDate };
    const updated = { ...showExtModal, status: 'extension-requested', extensionRequests: [...(showExtModal.extensionRequests || []), req] };
    await save('hops-delegations', delegations.map((x) => x.id === showExtModal.id ? updated : x));
    await logAct('EXTENSION REQUESTED', showExtModal.task);
    setShowExtModal(null); setExtReason(''); setExtDate('');
  }

  async function approveExtension(d) {
    const lastReq = (d.extensionRequests || []).slice(-1)[0];
    if (!lastReq) return;
    const updated = { ...d, status: 'extended', dueDate: lastReq.newDate };
    await save('hops-delegations', delegations.map((x) => x.id === d.id ? updated : x));
    await logAct('EXTENSION APPROVED', d.task);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>Delegation Tracker</h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => exportToExcel(filtered.map(d => ({ 'Task Name': d.taskName, Department: d.dept, 'Delegated By': d.ownerName, 'Delegated To': d.doerName, Status: d.status, 'Due Date': d.dueDate, Reason: d.reason })), 'delegations-export')} style={{ padding: '7px 14px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>⬇ Export</button>
          <button onClick={() => window.print()} style={{ padding: '7px 14px', borderRadius: 8, background: '#334155', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>🖨 Print</button>
          {canAdd && <button onClick={() => setShowForm(true)} style={{ padding: '7px 14px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>+ Delegate Task</button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
        {['', 'pending', 'accepted', 'done', 'extension-requested', 'extended', 'rejected'].map((s) => (
          <button key={s} onClick={() => setFilter(s)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 800, border: `1.5px solid ${filter === s ? '#0d7377' : '#d8e2ef'}`, background: filter === s ? '#0d7377' : 'white', color: filter === s ? 'white' : '#6b7a90', cursor: 'pointer' }}>
            {s || 'ALL'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length ? filtered.map((d) => (
          <div key={d.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', padding: '14px 16px', borderLeft: `4px solid ${STATUS_COLORS[d.status] || '#6b7a90'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <strong style={{ fontSize: 14 }}>{d.task}</strong>
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
          <Field label="Reason for Extension *"><textarea value={extReason} onChange={(e) => setExtReason(e.target.value)} placeholder="WHY DO YOU NEED MORE TIME..." style={{ ...IS, minHeight: 70, resize: 'vertical' }} /></Field>
          <Field label="New Due Date *"><input type="date" value={extDate} onChange={(e) => setExtDate(e.target.value)} style={IS} /></Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid #d8e2ef' }}>
            <button onClick={submitExtension} style={{ padding: '9px 18px', borderRadius: 8, background: '#6d28d9', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>🔄 Submit Request</button>
            <button onClick={() => setShowExtModal(null)} style={{ padding: '9px 18px', borderRadius: 8, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>Cancel</button>
          </div>
        </>}
      </Modal>
    </div>
  );
}
