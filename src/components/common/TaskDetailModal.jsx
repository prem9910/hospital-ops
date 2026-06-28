import { Modal } from './Modal';
import { DeptTag, PriorityBadge, FreqBadge } from './Badge';
import { wasCompletedLate, fDate, isAssignedTo } from '../../utils';

// Read-only task detail modal. Originally lived inside Tasks.jsx; extracted
// into a shared component so dashboard drilldown popups can reuse it without
// dragging in the entire Manage Tasks page. The component is intentionally
// pure: it receives the task object + auth context via props and emits
// callbacks (onDone / onEdit / onDelete) when action buttons are pressed.
// When those callbacks are null (e.g. from a read-only context like the
// dashboard), the action buttons are hidden automatically via the truthy
// checks at the bottom of the body.
export function TaskDetailModal({ task, open, onClose, onDone, canEdit, onEdit, onDelete, currentUser, currentRole }) {
  if (!task) return null;
  const isDone = task.status === 'done';
  const late = wasCompletedLate(task);
  const actHtml = (task.activityLog || []);

  return (
    <Modal open={open} onClose={onClose} title={task.name} maxWidth="max-w-xl">
      {/* Status banner */}
      {isDone && !late ? (
        <div style={{ background: '#d4edda', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 18 }}>✅</span>
          <div><div style={{ fontWeight: 800, color: '#155724' }}>COMPLETED ON TIME</div>
            <div style={{ fontSize: 11.5, color: '#1a7a4a' }}>By {task.doneBy || '—'} at {task.doneTime || '—'}</div></div>
        </div>
      ) : isDone && late ? (
        <div style={{ background: '#ede9fe', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
          <div style={{ fontWeight: 800, color: '#4c1d95' }}>⏰ COMPLETED WITH DELAY</div>
        </div>
      ) : (
        <div style={{ background: '#fff3cd', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
          <div style={{ fontWeight: 800, color: '#7a4800' }}>⏳ PENDING</div>
        </div>
      )}

      {/* Info */}
      <Section title="📋 Task Information">
        <Row label="Task Name"><strong>{task.name}</strong></Row>
        <Row label="Department"><DeptTag name={task.dept} /></Row>
        <Row label="Priority"><PriorityBadge priority={task.priority} /></Row>
        <Row label="Frequency"><FreqBadge freq={task.freq} /></Row>
        <Row label="Sched. Date"><span style={{ color: '#0d7377', fontWeight: 800 }}>{task.schedDate ? fDate(task.schedDate) + (task.time ? ' — ' + task.time : '') : '—'}</span></Row>
        {task.notes && <Row label="Notes"><span style={{ color: '#6b7a90' }}>{task.notes}</span></Row>}
      </Section>

      <Section title="👤 Assigned By / Assigned To">
        {task.createdBy && (
          <Row label="Assigned By">
            <span style={{ background: '#e8f4fd', color: '#0d7377', padding: '4px 10px', borderRadius: 8, fontWeight: 800, fontSize: 12 }}>
              👤 {task.createdBy}
            </span>
          </Row>
        )}
        <Row label="Assigned To">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(task.assignedTo || []).map((name, i) => (
              <div key={i} style={{ background: '#0b1e3d', color: 'white', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700 }}>
                {name}
                {task.assigneeEmails?.[i] && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{task.assigneeEmails[i]}</div>}
              </div>
            ))}
          </div>
        </Row>
      </Section>

      {isDone && (
        <Section title="✅ Completion Details">
          <Row label="Done By"><strong>{task.doneBy || '—'}</strong></Row>
          <Row label="Done At"><span style={{ color: '#0d7377', fontWeight: 800 }}>{task.doneTime || '—'}</span></Row>
          {task.doneRemark && <Row label="Remark">{task.doneRemark}</Row>}
        </Section>
      )}

      {late && task.delayReason && (
        <div style={{ background: '#faf5ff', border: '1.5px solid #c4b5fd', borderRadius: 8, padding: '10px 13px', marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#6d28d9', marginBottom: 6 }}>⏰ DELAY REASON</div>
          <div style={{ fontSize: 13, color: '#6d28d9', fontWeight: 600 }}>{task.delayReason}</div>
        </div>
      )}

      {/* Activity log */}
      <Section title="📜 Activity Log">
        {actHtml.length ? actHtml.map((a, i) => (
          <div key={i} style={{ padding: '5px 0', borderBottom: '1px solid #f0f4f9', fontSize: 11.5 }}>
            <strong>{a.by}</strong> — {a.action} <span style={{ color: '#6b7a90' }}>{a.details || ''}</span>
            <span style={{ float: 'right', color: '#6b7a90', fontSize: 10.5 }}>{a.at}</span>
          </div>
        )) : <span style={{ color: '#6b7a90', fontSize: 12 }}>No activity</span>}
      </Section>

      {/* Actions — hidden when called from a read-only context (e.g. dashboard
          drilldown). The truthy checks make the component safe to use in both
          read-only and interactive contexts without a separate code path. */}
      {!isDone && onDone && isAssignedTo(task, currentUser?.name) && (
        <button onClick={() => { onClose(); onDone(task); }} style={{ marginTop: 8, padding: '9px 16px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
          ✅ Mark Complete
        </button>
      )}
      {canEdit && onEdit && onDelete && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={() => { onClose(); onEdit(task); }} style={{ padding: '7px 14px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>✏️ Edit</button>
          <button onClick={() => { onClose(); onDelete(task); }} style={{ padding: '7px 14px', borderRadius: 8, background: '#c0392b', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>🗑️ Delete</button>
        </div>
      )}
    </Modal>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: '#f8fbff', borderRadius: 9, padding: '12px 14px', marginBottom: 10, border: '1px solid #d8e2ef' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 5, alignItems: 'flex-start' }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 100, paddingTop: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2535', flex: 1 }}>{children}</div>
    </div>
  );
}