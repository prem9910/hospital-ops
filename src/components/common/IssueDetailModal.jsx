import { Modal } from './Modal';
import { DeptTag, PriorityBadge, StatusBadge } from './Badge';
import { fDate } from '../../utils';

// Read-only issue detail modal. Issues don't have a shared detail component
// today — `Issues.jsx` only renders the resolve form inline — so this is a
// new file. The dashboard drilldown popups use it to show full issue
// details when the user clicks the 👁 View button on a row. It is
// intentionally pure: takes the issue object and emits no callbacks.
export function IssueDetailModal({ issue, open, onClose }) {
  if (!issue) return null;

  return (
    <Modal open={open} onClose={onClose} title={issue.title || 'Issue'} maxWidth="max-w-xl">
      <Section title="📋 Issue Details">
        <Row label="Title"><strong>{issue.title || '—'}</strong></Row>
        <Row label="Department"><DeptTag name={issue.dept} /></Row>
        <Row label="Priority"><PriorityBadge priority={issue.priority} /></Row>
        <Row label="Status"><StatusBadge status={issue.status} /></Row>
        <Row label="Reported By"><strong>{issue.reporter || '—'}</strong></Row>
        <Row label="Reported Date"><span style={{ color: '#0d7377', fontWeight: 800 }}>{issue.date ? fDate(issue.date) : '—'}</span></Row>
        {issue.assigned && <Row label="Assigned To"><strong>{issue.assigned}</strong></Row>}
      </Section>

      {issue.desc && (
        <Section title="📝 Description">
          <div style={{ fontSize: 13, color: '#1a2535', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{issue.desc}</div>
        </Section>
      )}

      {issue.status === 'resolved' && (
        <Section title="✅ Resolution">
          <Row label="Resolved By"><strong>{issue.resolveBy || '—'}</strong></Row>
          <Row label="Resolved At"><span style={{ color: '#0d7377', fontWeight: 800 }}>{issue.resolvedAt ? fDate(String(issue.resolvedAt).slice(0, 10)) : '—'}</span></Row>
          {issue.resolveRemark && <Row label="Remark"><span style={{ color: '#6b7a90' }}>{issue.resolveRemark}</span></Row>}
        </Section>
      )}

      {issue.status === 'escalated' && (
        <Section title="🚨 Escalation">
          {issue.escalatedTo && <Row label="Escalated To"><strong>{issue.escalatedTo}</strong></Row>}
          {issue.escalatedAt && <Row label="Escalated At"><span style={{ color: '#0d7377', fontWeight: 800 }}>{fDate(String(issue.escalatedAt).slice(0, 10))}</span></Row>}
          {issue.escalationReason && <Row label="Reason"><span style={{ color: '#6b7a90' }}>{issue.escalationReason}</span></Row>}
        </Section>
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