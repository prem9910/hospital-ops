import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { fDate, exportToExcel } from '../utils';
import { Modal } from '../components/common/Modal';
import { Alert, EmptyState } from '../components/common/Alert';

const IS = { width: '100%', padding: '9px 13px', borderRadius: 8, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 13, color: '#1a2535', outline: 'none', background: 'white', fontWeight: 600 };
function Field({ label, children }) {
  return <div style={{ marginBottom: 13 }}><label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</label>{children}</div>;
}
const STATUS_COLORS = { pending: '#d4920a', accepted: '#0d7377', done: '#1a7a4a', 'extension-requested': '#6d28d9', extended: '#c05a00', rejected: '#c0392b' };

export default function MyDelegations() {
  const { currentUser } = useAuth();
  const { delegations, save, logAct } = useApp();
  const [showExtModal, setShowExtModal] = useState(null);
  const [extReason, setExtReason] = useState('');
  const [extDate, setExtDate] = useState('');

  const myDels = delegations.filter((d) => d.doerName === currentUser.name);

  async function changeStatus(d, status) {
    await save('workdesk-delegations', delegations.map((x) => x.id === d.id ? { ...x, status } : x));
    await logAct('DELEGATION STATUS: ' + status.toUpperCase(), d.task);
  }

  async function submitExtension() {
    if (!extReason.trim() || !extDate) { alert('Reason and new date required!'); return; }
    const req = { requestedAt: new Date().toISOString(), reason: extReason.toUpperCase(), newDate: extDate };
    const updated = { ...showExtModal, status: 'extension-requested', extensionRequests: [...(showExtModal.extensionRequests || []), req] };
    await save('workdesk-delegations', delegations.map((x) => x.id === showExtModal.id ? updated : x));
    await logAct('EXTENSION REQUESTED', showExtModal.task);
    setShowExtModal(null); setExtReason(''); setExtDate('');
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-header-title" style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>📤 My Delegations</h2>
        <div className="page-header-actions">
          <button onClick={() => exportToExcel(myDels.map(d => ({ Task: d.taskName, Department: d.dept, 'Delegated By': d.ownerName, Status: d.status, 'Due Date': d.dueDate })), 'my-delegations')} style={{ padding: '7px 14px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>⬇ Export</button>
          <button onClick={() => window.print()} style={{ padding: '7px 14px', borderRadius: 8, background: '#334155', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>🖨 Print</button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {myDels.length ? myDels.map((d) => (
          <div key={d.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', padding: '14px 16px', borderLeft: `4px solid ${STATUS_COLORS[d.status] || '#6b7a90'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <strong style={{ fontSize: 14, color: d.task ? '#0b1e3d' : '#c0392b' }}>{d.task || '— Untitled task —'}</strong>
              <span style={{ background: STATUS_COLORS[d.status] || '#6b7a90', color: 'white', padding: '3px 10px', borderRadius: 20, fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase' }}>{d.status}</span>
            </div>
            <div style={{ fontSize: 12, color: '#6b7a90', marginTop: 5 }}>📅 Due: {fDate(d.dueDate)} &nbsp;|&nbsp; By: {d.createdBy} &nbsp;|&nbsp; 🏢 {d.dept || '—'}</div>
            {d.remarks && <div style={{ fontSize: 11, color: '#6b7a90', marginTop: 4 }}>📝 {d.remarks}</div>}
            <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
              {d.status === 'pending' && <button onClick={() => changeStatus(d, 'accepted')} style={{ padding: '4px 10px', borderRadius: 7, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>▶ Accept</button>}
              {(d.status === 'accepted' || d.status === 'extended') && <>
                <button onClick={() => changeStatus(d, 'done')} style={{ padding: '4px 10px', borderRadius: 7, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>✅ Done</button>
                <button onClick={() => setShowExtModal(d)} style={{ padding: '4px 10px', borderRadius: 7, background: '#6d28d9', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>🔄 Request Ext.</button>
              </>}
              {d.status === 'extension-requested' && <span style={{ fontSize: 11, color: '#6d28d9', fontWeight: 700 }}>⏳ Awaiting admin approval...</span>}
            </div>
          </div>
        )) : <EmptyState icon="📤" message="NO DELEGATIONS FOUND" />}
      </div>

      <Modal open={!!showExtModal} onClose={() => setShowExtModal(null)} title="Request Extension">
        {showExtModal && <>
          <Alert variant="purple">Extension request will be sent to admin for approval.</Alert>
          <Field label="Reason *"><textarea value={extReason} onChange={(e) => setExtReason(e.target.value)} placeholder="WHY DO YOU NEED MORE TIME..." style={{ ...IS, minHeight: 70, resize: 'vertical' }} /></Field>
          <Field label="New Due Date *"><input type="date" value={extDate} onChange={(e) => setExtDate(e.target.value)} style={IS} /></Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid #d8e2ef' }}>
            <button onClick={submitExtension} style={{ padding: '9px 18px', borderRadius: 8, background: '#6d28d9', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>🔄 Submit</button>
            <button onClick={() => setShowExtModal(null)} style={{ padding: '9px 18px', borderRadius: 8, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>Cancel</button>
          </div>
        </>}
      </Modal>
    </div>
  );
}
